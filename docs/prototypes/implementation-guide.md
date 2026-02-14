# Implementation Guide: Story Clash Codex → The Rift

## 🚀 Quick Start: Build Your MVP in Phases

---

## Phase 1: Core Rift Mechanics (Week 1-2)

### Goal: Prove the concept works and feels exciting

### 1. Basic Genre Wheel System

**File: `genreSystem.js`**

```javascript
class GenreSystem {
  constructor() {
    this.genres = [
      { id: 'horror', name: 'Horror', color: '#8b0000', power: 20 },
      { id: 'romance', name: 'Romance', color: '#ff69b4', power: 20 },
      { id: 'scifi', name: 'Sci-Fi', color: '#00ffff', power: 20 },
      { id: 'fantasy', name: 'Fantasy', color: '#daa520', power: 20 },
      { id: 'comedy', name: 'Comedy', color: '#ffd700', power: 20 }
    ];
    
    this.contaminations = new Map();
  }

  // Update genre power based on choice
  shiftGenrePower(genreShifts) {
    Object.entries(genreShifts).forEach(([genreName, shift]) => {
      const genre = this.genres.find(g => g.name === genreName);
      if (genre) {
        genre.power = Math.max(0, genre.power + shift);
      }
    });
    
    this.checkContamination();
    return this.getGenreBalance();
  }

  // Detect genre contamination
  checkContamination() {
    const sorted = [...this.genres].sort((a, b) => b.power - a.power);
    const top1 = sorted[0];
    const top2 = sorted[1];
    
    // If top 2 genres are within 10% of each other
    if (Math.abs(top1.power - top2.power) <= 10) {
      const contaminationKey = `${top1.id}+${top2.id}`;
      const current = this.contaminations.get(contaminationKey) || 0;
      this.contaminations.set(contaminationKey, current + 1);
      
      // Unlock hybrid genre after 3 contamination events
      if (current + 1 >= 3) {
        return { contaminated: true, hybrid: contaminationKey };
      }
    }
    
    return { contaminated: false };
  }

  // Get dominant genre for styling
  getDominantGenre() {
    return [...this.genres].sort((a, b) => b.power - a.power)[0];
  }

  // Get genre balance as percentages
  getGenreBalance() {
    const total = this.genres.reduce((sum, g) => sum + g.power, 0);
    return this.genres.map(g => ({
      ...g,
      percentage: (g.power / total * 100).toFixed(1)
    }));
  }

  // Calculate chaos level
  getChaosLevel() {
    // Higher variance = higher chaos
    const powers = this.genres.map(g => g.power);
    const mean = powers.reduce((a, b) => a + b) / powers.length;
    const variance = powers.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / powers.length;
    return Math.min(100, Math.round(variance * 2));
  }
}
```

### 2. Story State Management

**File: `storyEngine.js`**

```javascript
class StoryEngine {
  constructor() {
    this.currentScene = null;
    this.history = [];
    this.flags = new Set();
    this.hiddenStats = {
      chaos: 0,
      trust: 0,
      relationships: {}
    };
  }

  loadScene(sceneId, storyData) {
    const scene = storyData.scenes.find(s => s.id === sceneId);
    
    if (!scene) {
      console.error(`Scene ${sceneId} not found`);
      return null;
    }

    // Check if scene requirements are met
    if (scene.requiredFlags) {
      const hasFlags = scene.requiredFlags.every(flag => this.flags.has(flag));
      if (!hasFlags) return null;
    }

    this.currentScene = scene;
    this.history.push(sceneId);
    
    return this.prepareSceneForDisplay(scene);
  }

  prepareSceneForDisplay(scene) {
    // Apply dynamic modifications based on genre balance
    let displayText = scene.text;
    
    if (scene.dynamicElements) {
      const genreBalance = window.genreSystem.getGenreBalance();
      // Apply text variations based on conditions
      // (implementation depends on your structure)
    }

    return {
      id: scene.id,
      title: scene.title,
      text: displayText,
      choices: this.prepareChoices(scene.choices),
      activeGenres: scene.activeGenres
    };
  }

  prepareChoices(choices) {
    return choices.filter(choice => {
      // Filter choices based on availability conditions
      if (!choice.availableIf) return true;
      
      // Simple condition parsing (enhance as needed)
      return eval(choice.availableIf); // Be careful with eval in production
    });
  }

  makeChoice(choiceId) {
    const choice = this.currentScene.choices.find(c => c.id === choiceId);
    if (!choice) return;

    // Apply consequences
    if (choice.consequences) {
      const { genreShift, setFlag, hiddenStats, sceneTransition } = choice.consequences;
      
      // Shift genre power
      if (genreShift) {
        window.genreSystem.shiftGenrePower(genreShift);
      }

      // Set flags
      if (setFlag) {
        this.flags.add(setFlag);
      }

      // Update hidden stats
      if (hiddenStats) {
        Object.entries(hiddenStats).forEach(([stat, value]) => {
          this.hiddenStats[stat] = (this.hiddenStats[stat] || 0) + value;
        });
      }

      // Return next scene
      return sceneTransition;
    }
  }

  // Rift Event system
  checkRiftEvent(scene) {
    if (!scene.riftEventChance) return null;
    
    const chaos = window.genreSystem.getChaosLevel();
    const adjustedChance = scene.riftEventChance * (1 + chaos / 100);
    
    if (Math.random() < adjustedChance) {
      return this.triggerRiftEvent(scene);
    }
    
    return null;
  }

  triggerRiftEvent(scene) {
    const events = scene.possibleRiftEvents || [];
    if (events.length === 0) return null;
    
    // Pick random event
    const event = events[Math.floor(Math.random() * events.length)];
    
    // Apply event effects
    if (event.effect === "Random genre surges") {
      const randomGenre = window.genreSystem.genres[
        Math.floor(Math.random() * window.genreSystem.genres.length)
      ];
      window.genreSystem.shiftGenrePower({ [randomGenre.name]: 5 });
    }
    
    return event;
  }
}
```

### 3. Basic UI Components

**File: `ui.js`**

```javascript
class RiftUI {
  constructor() {
    this.animating = false;
  }

  // Update story display with genre-based styling
  updateStoryDisplay(scene, genreSystem) {
    const storyContainer = document.getElementById('story-text');
    const dominant = genreSystem.getDominantGenre();
    
    // Apply genre-specific class
    storyContainer.className = `story-text genre-${dominant.id}`;
    
    // Animated text reveal
    this.typewriterEffect(storyContainer, scene.text);
  }

  typewriterEffect(element, text, speed = 20) {
    if (this.animating) return;
    
    this.animating = true;
    element.innerHTML = '';
    let index = 0;
    
    const type = () => {
      if (index < text.length) {
        element.innerHTML += text.charAt(index);
        index++;
        setTimeout(type, speed);
      } else {
        this.animating = false;
      }
    };
    
    type();
  }

  // Display Rift Event
  showRiftEvent(event) {
    const overlay = document.createElement('div');
    overlay.className = 'rift-event-overlay';
    overlay.innerHTML = `
      <div class="rift-event-content">
        <h2>⚡ RIFT EVENT ⚡</h2>
        <p>${event.description}</p>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Animate in
    setTimeout(() => overlay.classList.add('active'), 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 500);
    }, 3000);
  }

  // Update genre balance bars
  updateGenreBalance(genreBalance) {
    const container = document.getElementById('genre-balance');
    container.innerHTML = genreBalance
      .sort((a, b) => b.power - a.power)
      .map(genre => `
        <div class="genre-bar" data-genre="${genre.id}">
          <div class="genre-bar-fill" 
               style="width: ${genre.percentage}%; background-color: ${genre.color};">
            <span class="genre-label">${genre.name}: ${genre.percentage}%</span>
          </div>
        </div>
      `).join('');
  }

  // Render choice buttons
  renderChoices(choices, onChoiceClick) {
    const container = document.getElementById('choices');
    container.innerHTML = choices.map(choice => `
      <button class="choice-btn" data-choice-id="${choice.id}">
        <div class="choice-text">${choice.text}</div>
        ${choice.flavorText ? `<div class="choice-flavor">${choice.flavorText}</div>` : ''}
        ${choice.genreShift ? `<div class="choice-effect">⚡ ${this.formatGenreShift(choice.genreShift)}</div>` : ''}
      </button>
    `).join('');
    
    // Add event listeners
    container.querySelectorAll('.choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const choiceId = btn.dataset.choiceId;
        onChoiceClick(choiceId);
      });
    });
  }

  formatGenreShift(genreShift) {
    return Object.entries(genreShift)
      .map(([genre, shift]) => `${genre} ${shift > 0 ? '+' : ''}${shift}`)
      .join(', ');
  }
}
```

---

## Phase 2: Visual Polish (Week 3-4)

### Goal: Make it look amazing

### Key CSS Enhancements

**File: `styles.css`**

```css
/* Genre-specific story styling */
.story-text.genre-horror {
  background: linear-gradient(135deg, rgba(139,0,0,0.3), rgba(0,0,0,0.5));
  border-left: 4px solid #8b0000;
  color: #ffcccc;
  text-shadow: 0 0 5px rgba(139,0,0,0.5);
  animation: flicker 3s infinite;
}

@keyframes flicker {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.95; }
  75% { opacity: 0.98; }
}

.story-text.genre-romance {
  background: linear-gradient(135deg, rgba(255,182,193,0.2), rgba(255,105,180,0.2));
  border-left: 4px solid #ff69b4;
  color: #ffe4e1;
  font-style: italic;
  animation: glow 2s ease-in-out infinite;
}

@keyframes glow {
  0%, 100% { box-shadow: 0 0 10px rgba(255,105,180,0.3); }
  50% { box-shadow: 0 0 20px rgba(255,105,180,0.6); }
}

/* Rift Event overlay */
.rift-event-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  opacity: 0;
  transition: opacity 0.5s;
}

.rift-event-overlay.active {
  opacity: 1;
}

.rift-event-content {
  background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
  padding: 40px;
  border-radius: 20px;
  text-align: center;
  animation: riftPulse 0.5s ease-in-out;
}

@keyframes riftPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

/* Animated wheel */
.wheel-container {
  position: relative;
  width: 300px;
  height: 300px;
  margin: 0 auto;
}

.wheel {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  position: relative;
  box-shadow: 0 0 40px rgba(78,205,196,0.5);
  transition: transform 0.5s ease-out;
}

.wheel.spinning {
  animation: wheelSpin 3s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
}

@keyframes wheelSpin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(1800deg); }
}
```

### Particle Effects for Rift Events

**File: `particles.js`**

```javascript
class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
  }

  createRiftParticles(genre) {
    const color = this.getGenreColor(genre);
    
    for (let i = 0; i < 50; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        life: 100,
        color: color
      });
    }
    
    this.animate();
  }

  animate() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.particles = this.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      
      if (p.life <= 0) return false;
      
      this.ctx.fillStyle = `${p.color}${Math.floor(p.life / 100 * 255).toString(16).padStart(2, '0')}`;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      this.ctx.fill();
      
      return true;
    });
    
    if (this.particles.length > 0) {
      requestAnimationFrame(() => this.animate());
    }
  }

  getGenreColor(genreId) {
    const colors = {
      horror: '#8b0000',
      romance: '#ff69b4',
      scifi: '#00ffff',
      fantasy: '#daa520',
      comedy: '#ffd700'
    };
    return colors[genreId] || '#ffffff';
  }
}
```

---

## Phase 3: Persistence & Episodes (Week 5-6)

### Goal: Make players want to return

### Save System

**File: `saveSystem.js`**

```javascript
class SaveSystem {
  constructor() {
    this.storageKey = 'rift_save_data';
  }

  saveProgress(data) {
    const saveData = {
      version: '1.0',
      timestamp: Date.now(),
      currentEpisode: data.episode,
      genrePower: data.genrePower,
      worldScars: data.worldScars,
      artifacts: data.artifacts,
      characterMemory: data.characterMemory,
      hiddenStats: data.hiddenStats,
      history: data.history,
      storyDNA: this.generateStoryDNA(data)
    };
    
    localStorage.setItem(this.storageKey, JSON.stringify(saveData));
    return saveData.storyDNA;
  }

  loadProgress() {
    const saved = localStorage.getItem(this.storageKey);
    if (!saved) return null;
    
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load save data', e);
      return null;
    }
  }

  generateStoryDNA(data) {
    // Create unique hash from player's journey
    const components = [
      data.episode,
      JSON.stringify(data.genrePower),
      data.worldScars.join(','),
      data.artifacts.join(','),
      Math.floor(data.hiddenStats.chaos / 10)
    ];
    
    // Simple hash function (use better hash in production)
    const hash = components.join('|').split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    
    return `RIFT-${Math.abs(hash).toString(36).toUpperCase()}`;
  }

  // Allow players to share and load others' stories
  exportStoryDNA() {
    const save = this.loadProgress();
    if (!save) return null;
    
    return {
      dna: save.storyDNA,
      shareText: `I just completed Episode ${save.currentEpisode} of The Rift! 
                  My story DNA: ${save.storyDNA}
                  Chaos Level: ${save.hiddenStats.chaos}%
                  Try my path: [Game URL]?dna=${save.storyDNA}`
    };
  }

  importStoryDNA(dna) {
    // Reconstruct story state from DNA
    // (Implementation depends on your hash algorithm)
  }
}
```

---

## Phase 4: Multiplayer & Voting (Week 7-8)

### Real-time Voting System

**File: `multiplayerSystem.js`**

```javascript
class MultiplayerVoting {
  constructor() {
    this.socket = null; // WebSocket connection
    this.roomCode = null;
    this.players = [];
    this.currentVote = null;
  }

  async createRoom() {
    // Create new room and return code
    const response = await fetch('/api/rooms/create', { method: 'POST' });
    const { roomCode } = await response.json();
    this.roomCode = roomCode;
    this.connectToRoom(roomCode);
    return roomCode;
  }

  connectToRoom(roomCode) {
    this.socket = new WebSocket(`wss://your-server.com/rooms/${roomCode}`);
    
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };
  }

  handleMessage(message) {
    switch (message.type) {
      case 'player_joined':
        this.players.push(message.player);
        this.updatePlayerList();
        break;
        
      case 'vote_cast':
        this.currentVote.votes[message.choiceId]++;
        this.updateVoteDisplay();
        break;
        
      case 'vote_complete':
        this.resolveVote(message.result);
        break;
    }
  }

  startVote(choices) {
    this.currentVote = {
      choices: choices,
      votes: {},
      startTime: Date.now()
    };
    
    choices.forEach(choice => {
      this.currentVote.votes[choice.id] = 0;
    });
    
    this.socket.send(JSON.stringify({
      type: 'start_vote',
      choices: choices
    }));
    
    this.displayVoteUI();
  }

  castVote(choiceId) {
    this.socket.send(JSON.stringify({
      type: 'cast_vote',
      choiceId: choiceId
    }));
  }

  resolveVote(result) {
    const total = Object.values(result.votes).reduce((a, b) => a + b, 0);
    const winner = Object.entries(result.votes)
      .sort((a, b) => b[1] - a[1])[0];
    
    const percentage = (winner[1] / total * 100).toFixed(0);
    
    // Check for unanimous or split vote
    if (percentage === '100') {
      return { type: 'unanimous', choiceId: winner[0] };
    } else if (percentage < 60) {
      return { type: 'fractured', choiceId: winner[0], opposition: 100 - percentage };
    } else {
      return { type: 'majority', choiceId: winner[0] };
    }
  }

  updateVoteDisplay() {
    const container = document.getElementById('vote-display');
    const total = Object.values(this.currentVote.votes).reduce((a, b) => a + b, 0);
    
    container.innerHTML = Object.entries(this.currentVote.votes)
      .map(([choiceId, votes]) => {
        const percentage = total > 0 ? (votes / total * 100).toFixed(0) : 0;
        return `
          <div class="vote-bar">
            <div class="vote-fill" style="width: ${percentage}%">
              Choice ${choiceId}: ${percentage}%
            </div>
          </div>
        `;
      }).join('');
  }
}
```

---

## Priority Feature Checklist

### Must-Have (MVP)
- [ ] Genre wheel with 5 genres
- [ ] Genre balance tracking
- [ ] 3 complete story scenes with branching
- [ ] Choice system with genre shifts
- [ ] Basic Rift Events (at least 2 types)
- [ ] Adaptive text styling per genre
- [ ] Save/load functionality

### Should-Have (Polish)
- [ ] Animated wheel spin
- [ ] Particle effects
- [ ] Sound effects / music
- [ ] 3 different endings
- [ ] Story canvas visualization
- [ ] Character memory system

### Could-Have (Enhancement)
- [ ] Multiplayer voting
- [ ] Story DNA sharing
- [ ] Global statistics
- [ ] Achievement system
- [ ] Custom story creator

### Won't-Have (Future)
- AI-generated content (Phase 5)
- Mobile app (Phase 5)
- User mods (Phase 5)
- Voice acting (Phase 5)

---

## Testing Checklist

### Gameplay Testing
- [ ] Can players understand the genre system?
- [ ] Are Rift Events exciting or annoying?
- [ ] Do choices feel meaningful?
- [ ] Is the pacing good (not too slow/fast)?
- [ ] Are endings satisfying?

### Technical Testing
- [ ] Does save/load work reliably?
- [ ] Are animations smooth?
- [ ] Does it work on mobile?
- [ ] Can multiple players vote simultaneously?
- [ ] Does genre contamination trigger correctly?

---

## Launch Strategy

### Week 9-10: Soft Launch
1. Friends & family playtest
2. Fix major bugs
3. Gather feedback on:
   - Clarity of genre system
   - Fun factor of Rift Events
   - Replayability
   - UI/UX issues

### Week 11-12: Public Beta
1. Release to small community (Discord, Reddit)
2. Run analytics on:
   - Average session length
   - Completion rate
   - Most popular choices
   - Bug reports
3. Iterate based on feedback

### Week 13+: Full Launch
1. Marketing push (social media, game forums)
2. Create trailer showcasing Rift Events
3. Build community features
4. Plan content updates (new episodes)

---

## Quick Wins to Do TODAY

1. **Create the basic HTML structure** (2 hours)
   - Use the prototype I created as a starting point
   - Add your own branding/style

2. **Implement genre system** (3 hours)
   - Copy the GenreSystem class
   - Test it in console
   - Make sure balance updates work

3. **Write ONE complete story** (2-3 hours)
   - Start → 3 choices → 3 different scenes → 1 ending
   - Test genre shifts work as expected

4. **Add ONE Rift Event** (1 hour)
   - Make it interrupt a scene
   - Show alert/animation
   - Prove the chaos can work

**By end of day:** You'll have a working prototype that demonstrates the core concept!

---

## Resources & Tools

### Recommended Tech Stack
- **Frontend**: React or Vue.js
- **Animation**: Framer Motion / GSAP
- **Real-time**: Socket.io or Firebase
- **Backend**: Node.js + Express
- **Database**: PostgreSQL or MongoDB
- **Deployment**: Vercel or Netlify (frontend), Railway (backend)

### Useful Libraries
- `howler.js` - Audio management
- `canvas-confetti` - Quick particle effects
- `recharts` - Story canvas visualization
- `zustand` or `redux` - State management
- `react-spring` - Smooth animations

### Design Resources
- Color palettes for each genre
- Icon sets (Font Awesome, Heroicons)
- Sound effects (freesound.org, zapsplat.com)
- Background music (incompetech.com)

---

## Final Tips

1. **Start small** - Don't try to build everything at once
2. **Playtest early** - Get feedback after every feature
3. **Focus on feel** - The Rift Events should feel special
4. **Iterate fast** - Don't get stuck on perfection
5. **Have fun** - If you're not excited, players won't be either

**Most important:** Build the thing that makes YOU excited to play. That energy will translate to your players.

Good luck! 🚀⚡
