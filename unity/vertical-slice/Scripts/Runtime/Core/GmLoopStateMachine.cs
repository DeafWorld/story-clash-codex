using System;
using System.Collections.Generic;
using System.Linq;

namespace StoryClash.VerticalSlice.Core
{
    public enum GmPhase
    {
        WritingBeat,
        Reading,
        CreatingChoices,
        VotingOpen,
        VoteLocked,
        WritingConsequence,
        Recap,
    }

    public sealed class GmLoopStateMachine
    {
        public event Action<GmPhase>? PhaseChanged;

        public GmPhase Phase { get; private set; } = GmPhase.WritingBeat;
        public int BeatIndex { get; private set; }
        public int VoteDeadlineUnixMs { get; private set; }
        public string? LockedChoiceId { get; private set; }
        public string? ConsequenceText { get; private set; }

        private readonly string roomCode;
        private readonly string gmPlayerId;
        private readonly HashSet<string> connectedPlayers = new();
        private readonly HashSet<string> readyPlayers = new();
        private readonly Dictionary<string, string> votesByPlayer = new();
        private readonly Dictionary<string, int> countsByChoice = new();
        private readonly List<string> choiceIds = new();
        private bool gmReady;

        public GmLoopStateMachine(string roomCode, string gmPlayerId, IEnumerable<string> participants)
        {
            this.roomCode = roomCode;
            this.gmPlayerId = gmPlayerId;
            foreach (var id in participants)
            {
                if (!string.IsNullOrWhiteSpace(id) && id != gmPlayerId)
                {
                    connectedPlayers.Add(id);
                }
            }
        }

        public void PublishBeat()
        {
            EnsurePhase(GmPhase.WritingBeat);
            ResetReadiness();
            ResetVoteState();
            ConsequenceText = null;
            LockedChoiceId = null;
            SetPhase(GmPhase.Reading);
        }

        public void PublishChoices(IEnumerable<string> choices)
        {
            EnsurePhase(GmPhase.Reading, GmPhase.CreatingChoices);
            choiceIds.Clear();
            choiceIds.AddRange(choices.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.Ordinal).Take(3));
            if (choiceIds.Count == 0)
            {
                throw new InvalidOperationException("At least one choice is required.");
            }
            SetPhase(GmPhase.CreatingChoices);
            TryOpenVoting();
        }

        public void MarkPlayerReady(string playerId)
        {
            if (Phase != GmPhase.Reading && Phase != GmPhase.CreatingChoices)
            {
                throw new InvalidOperationException("Readiness is only valid during reading/choice setup.");
            }
            if (connectedPlayers.Contains(playerId))
            {
                readyPlayers.Add(playerId);
            }
            TryOpenVoting();
        }

        public void MarkGmReady()
        {
            if (Phase != GmPhase.Reading && Phase != GmPhase.CreatingChoices)
            {
                throw new InvalidOperationException("GM readiness is only valid during reading/choice setup.");
            }
            gmReady = true;
            TryOpenVoting();
        }

        public bool SubmitVote(string playerId, string choiceId, int nowUnixMs)
        {
            EnsurePhase(GmPhase.VotingOpen);
            if (!connectedPlayers.Contains(playerId))
            {
                throw new InvalidOperationException("Only connected players can vote.");
            }
            if (!choiceIds.Contains(choiceId, StringComparer.Ordinal))
            {
                throw new InvalidOperationException("Unknown choice id.");
            }
            if (votesByPlayer.ContainsKey(playerId))
            {
                throw new InvalidOperationException("One vote per player per beat.");
            }

            votesByPlayer[playerId] = choiceId;
            countsByChoice.TryGetValue(choiceId, out var count);
            countsByChoice[choiceId] = count + 1;

            var totalVoters = Math.Max(1, connectedPlayers.Count);
            var majority = (totalVoters / 2) + 1;
            var maxVotes = countsByChoice.Values.DefaultIfEmpty(0).Max();
            if (maxVotes >= majority || votesByPlayer.Count >= totalVoters || nowUnixMs >= VoteDeadlineUnixMs)
            {
                LockVote();
                return true;
            }
            return false;
        }

        public bool ForceLockIfDue(int nowUnixMs)
        {
            if (Phase != GmPhase.VotingOpen)
            {
                return false;
            }
            if (nowUnixMs < VoteDeadlineUnixMs)
            {
                return false;
            }
            LockVote();
            return true;
        }

        public void PublishConsequence(string text)
        {
            EnsurePhase(GmPhase.VoteLocked);
            ConsequenceText = text?.Trim();
            if (string.IsNullOrWhiteSpace(ConsequenceText))
            {
                throw new InvalidOperationException("Consequence text is required.");
            }
            SetPhase(GmPhase.WritingConsequence);
        }

        public void NextBeat()
        {
            EnsurePhase(GmPhase.WritingConsequence);
            BeatIndex += 1;
            SetPhase(GmPhase.WritingBeat);
        }

        public void MoveToRecap()
        {
            if (Phase == GmPhase.WritingConsequence || Phase == GmPhase.VoteLocked)
            {
                SetPhase(GmPhase.Recap);
                return;
            }
            throw new InvalidOperationException("Recap is only available after vote lock/consequence.");
        }

        public void UpdateConnectedPlayers(IEnumerable<string> participantIds)
        {
            connectedPlayers.Clear();
            foreach (var id in participantIds)
            {
                if (!string.IsNullOrWhiteSpace(id) && id != gmPlayerId)
                {
                    connectedPlayers.Add(id);
                }
            }
            readyPlayers.RemoveWhere(id => !connectedPlayers.Contains(id));
            if (Phase == GmPhase.Reading || Phase == GmPhase.CreatingChoices)
            {
                TryOpenVoting();
            }
        }

        private void TryOpenVoting()
        {
            if (Phase != GmPhase.Reading && Phase != GmPhase.CreatingChoices)
            {
                return;
            }
            if (!gmReady)
            {
                return;
            }
            if (choiceIds.Count == 0)
            {
                return;
            }
            var allReady = connectedPlayers.All(id => readyPlayers.Contains(id));
            if (!allReady)
            {
                return;
            }
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            VoteDeadlineUnixMs = (int)Math.Min(int.MaxValue, now + 30_000);
            SetPhase(GmPhase.VotingOpen);
        }

        private void LockVote()
        {
            var maxVotes = countsByChoice.Values.DefaultIfEmpty(0).Max();
            var topChoices = countsByChoice
                .Where(entry => entry.Value == maxVotes)
                .Select(entry => entry.Key)
                .Distinct(StringComparer.Ordinal)
                .OrderBy(id => id, StringComparer.Ordinal)
                .ToList();

            if (topChoices.Count == 0)
            {
                topChoices = choiceIds.Take(1).ToList();
            }
            LockedChoiceId = ResolveDeterministicWinner(roomCode, BeatIndex, topChoices);
            SetPhase(GmPhase.VoteLocked);
        }

        private static string ResolveDeterministicWinner(string roomCode, int beatIndex, List<string> topChoices)
        {
            if (topChoices.Count == 0)
            {
                throw new InvalidOperationException("No top choices available for lock.");
            }
            if (topChoices.Count == 1)
            {
                return topChoices[0];
            }

            var seed = $"{roomCode}:{beatIndex}:{string.Join(",", topChoices.OrderBy(v => v, StringComparer.Ordinal))}";
            var hash = StableHash(seed);
            var index = hash % topChoices.Count;
            return topChoices[index];
        }

        private static int StableHash(string input)
        {
            unchecked
            {
                uint hash = 2166136261;
                foreach (var ch in input)
                {
                    hash ^= ch;
                    hash *= 16777619;
                }
                return (int)(hash & 0x7FFFFFFF);
            }
        }

        private void ResetReadiness()
        {
            gmReady = false;
            readyPlayers.Clear();
        }

        private void ResetVoteState()
        {
            votesByPlayer.Clear();
            countsByChoice.Clear();
            VoteDeadlineUnixMs = 0;
        }

        private void SetPhase(GmPhase next)
        {
            if (Phase == next)
            {
                return;
            }
            Phase = next;
            PhaseChanged?.Invoke(next);
        }

        private void EnsurePhase(params GmPhase[] allowed)
        {
            if (!allowed.Contains(Phase))
            {
                throw new InvalidOperationException($"Invalid phase transition: {Phase}");
            }
        }
    }
}
