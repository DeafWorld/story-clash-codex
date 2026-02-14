# 🚀 ADD YOUR FIRST RIFT EVENT IN 30 MINUTES

This is copy-paste code you can add to your existing game TODAY to get Rift Events working.

---

## STEP 1: Add State (5 minutes)

Add this to your game state (wherever you're managing state - Context, Zustand, etc):

```javascript
// Add these to your existing state
const [riftEvent, setRiftEvent] = useState(null);
const [showRiftOverlay, setShowRiftOverlay] = useState(false);
const [eventTimeline, setEventTimeline] = useState([]);
```

---

## STEP 2: Create the Rift Event Trigger (10 minutes)

```javascript
// Add this function to your game logic
const checkAndTriggerRiftEvent = (currentGameState) => {
  const { chaos, currentTurn, genres } = currentGameState;
  
  // Don't trigger on first 2 turns
  if (currentTurn < 2) return;
  
  // Chance increases with chaos (10% at 0 chaos, 40% at 100 chaos)
  const riftChance = (chaos / 100) * 0.3 + 0.1;
  
  if (Math.random() < riftChance) {
    // Pick random genre to surge
    const genreNames = Object.keys(genres);
    const surgingGenre = genreNames[Math.floor(Math.random() * genreNames.length)];
    
    // Create the event
    const event = {
      id: `rift_${Date.now()}`,
      type: 'genre_surge',
      genre: surgingGenre,
      timestamp: new Date(),
      message: getRiftMessage(surgingGenre),
      genreShift: 15 // How much the genre increases
    };
    
    // Show it
    setRiftEvent(event);
    setShowRiftOverlay(true);
    
    // Log to timeline
    setEventTimeline(prev => [...prev, event]);
    
    // Auto-hide after 3 seconds and apply effect
    setTimeout(() => {
      applyRiftEffect(event);
      setShowRiftOverlay(false);
    }, 3000);
  }
};

// Genre-specific messages
const getRiftMessage = (genre) => {
  const messages = {
    outbreak: [
      'The infection spreads faster! Bodies twitch with unnatural life...',
      'OUTBREAK INTENSIFIES! The dead are rising everywhere...',
      'Biological horror surges through reality!'
    ],
    invasion: [
      'ALIEN PRESENCE DETECTED! The skies darken with ships...',
      'INVASION ESCALATES! They\'re adapting to our defenses...',
      'Extraterrestrial forces breach reality!'
    ],
    haunting: [
      'THE VEIL TEARS! Ghosts flood through from beyond...',
      'HAUNTING INTENSIFIES! The dead will not rest...',
      'Supernatural forces overwhelm the living!'
    ]
  };
  
  const genreMessages = messages[genre.toLowerCase()] || [
    `${genre.toUpperCase()} SURGES! Reality bends...`
  ];
  
  return genreMessages[Math.floor(Math.random() * genreMessages.length)];
};

// Apply the actual effect
const applyRiftEffect = (event) => {
  // Update genre balance
  setGenres(prev => {
    const total = Object.values(prev).reduce((a, b) => a + b, 0);
    const newGenres = { ...prev };
    
    // Increase surging genre
    newGenres[event.genre] = Math.min(100, prev[event.genre] + event.genreShift);
    
    // Normalize so total is still 100
    const newTotal = Object.values(newGenres).reduce((a, b) => a + b, 0);
    Object.keys(newGenres).forEach(key => {
      newGenres[key] = Math.round((newGenres[key] / newTotal) * 100);
    });
    
    return newGenres;
  });
  
  // Increase chaos slightly
  setChaos(prev => Math.min(100, prev + 5));
};
```

---

## STEP 3: Call It After Each Choice (2 minutes)

In your existing choice handler, add:

```javascript
const handlePlayerChoice = (choiceId) => {
  // ... your existing choice logic
  
  // After processing the choice, check for Rift Event
  checkAndTriggerRiftEvent({
    chaos: currentChaos,
    currentTurn: turnNumber,
    genres: currentGenres
  });
};
```

---

## STEP 4: Add the Visual Overlay (10 minutes)

Add this component to your game view:

```jsx
function RiftEventOverlay({ event, show }) {
  if (!show || !event) return null;
  
  // Genre-specific colors
  const colors = {
    outbreak: { from: '#8b0000', to: '#dc143c' },
    invasion: { from: '#006400', to: '#32cd32' },
    haunting: { from: '#4b0082', to: '#9370db' }
  };
  
  const genreColor = colors[event.genre.toLowerCase()] || { from: '#666', to: '#999' };
  
  return (
    <div className="rift-overlay">
      <div 
        className="rift-content"
        style={{
          background: `linear-gradient(45deg, ${genreColor.from}, ${genreColor.to})`
        }}
      >
        <h2 className="rift-title">⚡ RIFT EVENT ⚡</h2>
        <p className="rift-genre">{event.genre.toUpperCase()} SURGES</p>
        <p className="rift-message">{event.message}</p>
      </div>
    </div>
  );
}

// In your main game component:
<>
  {/* Your existing game UI */}
  
  <RiftEventOverlay event={riftEvent} show={showRiftOverlay} />
</>
```

---

## STEP 5: Add the CSS (3 minutes)

```css
.rift-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.rift-content {
  padding: 60px;
  border-radius: 20px;
  text-align: center;
  animation: pulse 0.5s ease-in-out infinite;
  box-shadow: 0 0 60px rgba(255, 255, 255, 0.3);
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.rift-title {
  font-size: 3em;
  font-weight: bold;
  margin: 0 0 20px 0;
  color: white;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.8);
}

.rift-genre {
  font-size: 2em;
  font-weight: bold;
  margin: 0 0 15px 0;
  color: rgba(255, 255, 255, 0.9);
}

.rift-message {
  font-size: 1.3em;
  color: rgba(255, 255, 255, 0.95);
  max-width: 600px;
  line-height: 1.4;
}
```

---

## STEP 6: Update Your World Event Timeline (5 minutes)

Show the events in your timeline component:

```jsx
function WorldEventTimeline({ events }) {
  if (events.length === 0) {
    return (
      <div className="timeline-empty">
        No major world events yet. Pressure is building...
      </div>
    );
  }
  
  return (
    <div className="timeline">
      <h3>World Event Timeline</h3>
      {events.slice(-5).reverse().map(event => ( // Show last 5
        <div key={event.id} className="timeline-event">
          <span className="event-icon">⚡</span>
          <span className="event-type">{event.genre.toUpperCase()} SURGE</span>
          <span className="event-time">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// Use it:
<WorldEventTimeline events={eventTimeline} />
```

---

## 🎯 TESTING IT

1. Start a game
2. Make 2-3 choices
3. Watch for Rift Event (30-40% chance after each choice)
4. See the dramatic overlay
5. Watch genres shift in real-time
6. Check timeline for logged events

**If nothing happens:** Increase the riftChance to 0.8 for testing (80% chance)

---

## ✨ BONUS: Add Sound (Optional, 5 minutes)

```javascript
// Create a simple sound
const playRiftSound = () => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = 200;
  oscillator.type = 'sine';
  
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 1);
};

// Call it when showing the overlay:
setShowRiftOverlay(true);
playRiftSound();
```

---

## 📈 EXPECTED RESULT

**Before:** Genres are numbers that change
**After:** Genres actively fight for control with dramatic interruptions

**This single feature transforms:**
- "Meh, genres shift" → "OH SHIT, REALITY IS BREAKING"
- Predictable → Exciting
- Numbers → Narrative

---

## 🎯 NEXT STEPS AFTER THIS WORKS

Once you have ONE Rift Event working:

1. **Add variety** - More event types (not just genre surge)
   - Timeline fractures
   - Character mutations
   - Reality glitches

2. **Make them rarer but more impactful** - Lower chance but bigger effects

3. **Tie to consequences** - Rift Events that callback to earlier choices

4. **Player triggers** - Let players spend "Rift Points" to force events

But first: **Get the basic one working.**

---

## 💡 DEBUGGING TIPS

**Event not triggering?**
- Check chaos level (higher = more likely)
- Check turn count (must be > 2)
- Temporarily set riftChance to 1.0 to force it

**Overlay not showing?**
- Check z-index (must be high)
- Check if showRiftOverlay state is updating
- Console.log the event object

**Genres not shifting?**
- Verify applyRiftEffect is being called
- Check setTimeout is firing
- Log the genre state before/after

---

## 🚀 DEPLOY IT

Once working locally:
```bash
git add .
git commit -m "Add Rift Events system"
git push

# Vercel will auto-deploy
```

**Total time: ~30 minutes**
**Impact: Transforms the entire feel of the game**

Go make it happen. ⚡
