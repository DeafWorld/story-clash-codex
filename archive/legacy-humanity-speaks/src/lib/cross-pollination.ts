const confessionBinaryTemplates = [
  {
    question: "Confession: \"{snippet}\" — do you relate?",
    optionA: "I relate",
    optionB: "Not me",
  },
  {
    question: "Keep it secret or say it out loud?",
    optionA: "Keep it",
    optionB: "Say it",
  },
  {
    question: "Would you admit this too?",
    optionA: "Yes",
    optionB: "No",
  },
  {
    question: "Is this more common than we admit?",
    optionA: "Yes",
    optionB: "No",
  },
];

const binaryAskTemplates = [
  "Why did you choose {winner}?",
  "What made you pick {winner}?",
  "What does choosing {winner} say about you?",
  "Tell us the story behind {winner}.",
];

const askConfessionTemplates = [
  "Confess: {question}",
  "Tell the truth about: {question}",
  "What would you admit about this? {question}",
];

function truncate(text: string, length = 140) {
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1).trim()}…`;
}

export function confessionToBinary(content: string) {
  const template = confessionBinaryTemplates[Math.floor(Math.random() * confessionBinaryTemplates.length)];
  return {
    question_text: template.question.replace("{snippet}", truncate(content)),
    option_a: template.optionA,
    option_b: template.optionB,
  };
}

export function binaryToAsk(questionText: string, winner: string) {
  const template = binaryAskTemplates[Math.floor(Math.random() * binaryAskTemplates.length)];
  return {
    question_text: template.replace("{winner}", winner),
    source: questionText,
  };
}

export function askToConfessionPrompt(questionText: string) {
  const template = askConfessionTemplates[Math.floor(Math.random() * askConfessionTemplates.length)];
  return template.replace("{question}", truncate(questionText, 120));
}
