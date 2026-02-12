# THE LIVING RIFT - Self-Evolving Story Engine
## Architecture for Extreme Execution

---

## 🧠 CORE PHILOSOPHY: EMERGENCE OVER SCRIPTING

**Traditional approach:** Author writes all branches
**Our approach:** Author designs *systems* that generate unique stories

**Key Principle:** The story engine is a **living organism** that:
- Learns from player behavior across ALL sessions
- Generates content procedurally within safety rails
- Creates unique outcomes no player can predict
- Evolves its own meta-narrative over time

---

## 🏗️ ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    PLAYER INTERFACE                         │
│  (React/Vue UI with real-time updates)                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              NARRATIVE DIRECTOR (Core Engine)               │
│  • Analyzes current state                                   │
│  • Chooses next scene from candidate pool                   │
│  • Triggers AI generation when needed                       │
│  • Manages emergent events                                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┬──────────────┐
        │             │             │              │
┌───────▼──────┐ ┌───▼──────┐ ┌───▼──────┐ ┌────▼─────┐
│ WORLD STATE  │ │ PLAYER   │ │  SCENE   │ │   AI     │
│   ENGINE     │ │ PROFILES │ │  POOL    │ │ CONTENT  │
│              │ │          │ │          │ │ GENERATOR│
│ • Factions   │ │• Traits  │ │• Templates│ │          │
│ • Resources  │ │• History │ │• Weights │ │• Claude  │
│ • Scars      │ │• Arcs    │ │• Locks   │ │• Prompts │
│ • Tensions   │ │• Bonds   │ │          │ │          │
└──────────────┘ └──────────┘ └──────────┘ └──────────┘
```

---

## 📊 LAYER 1: WORLD STATE ENGINE

### Dynamic State Model (Not Just Variables)

```javascript
class WorldState {
  constructor() {
    // FACTIONS - NPCs form dynamic relationships
    this.factions = {
      survivors: {
        loyalty: 50,        // 0-100
        power: 30,
        leader: null,       // Can change!
        traits: ['desperate', 'paranoid'],
        relationships: {
          scientists: -20,  // Negative = hostile
          military: 15
        }
      },
      scientists: {
        loyalty: 70,
        power: 40,
        leader: 'Dr. Chen',
        traits: ['rational', 'secretive'],
        relationships: {
          survivors: -20,
          military: 30
        }
      },
      military: {
        loyalty: 80,
        power: 60,
        leader: 'Commander Shaw',
        traits: ['authoritarian', 'pragmatic'],
        relationships: {
          survivors: 15,
          scientists: 30
        }
      }
    };

    // RESOURCES - Scarcity drives conflict
    this.resources = {
      food: { amount: 45, trend: 'declining', crisisPoint: 20 },
      medicine: { amount: 30, trend: 'stable', crisisPoint: 15 },
      ammunition: { amount: 60, trend: 'declining', crisisPoint: 25 },
      fuel: { amount: 20, trend: 'critical', crisisPoint: 10 }
    };

    // WORLD SCARS - Permanent changes from past choices
    this.scars = new Set([
      // Examples from past games:
      // 'medical_bay_destroyed',
      // 'alliance_with_raiders',
      // 'dr_chen_dead'
    ]);

    // TENSIONS - Multiple crises can build simultaneously
    this.tensions = {
      food_shortage: 0,        // 0-100
      faction_conflict: 0,
      external_threat: 0,
      morale_crisis: 0,
      disease_outbreak: 0
    };

    // TIMELINE - Major events that occurred
    this.timeline = [];

    // SECRETS - Unknown to players but affect world
    this.secrets = {
      infection_patient_zero: null,
      hidden_resources: [],
      faction_betrayals_planned: []
    };

    // META STATE - Tracks across ALL player sessions
    this.meta = {
      gamesPlayed: 0,
      mostCommonEnding: null,
      rarePath: false,  // Is this an unusual playthrough?
      communityChoiceInfluence: 0  // Global voting affects this world
    };
  }

  // EMERGENT EVENTS based on thresholds
  checkEmergentEvents() {
    const events = [];

    // Resource crisis
    Object.entries(this.resources).forEach(([resource, data]) => {
      if (data.amount <= data.crisisPoint && !this.hasActiveCrisis(resource)) {
        events.push({
          type: 'resource_crisis',
          resource: resource,
          severity: 'critical',
          autoTrigger: true
        });
      }
    });

    // Faction warfare
    Object.entries(this.factions).forEach(([name, faction]) => {
      Object.entries(faction.relationships).forEach(([otherName, relationship]) => {
        if (relationship < -40 && Math.random() < 0.3) {
          events.push({
            type: 'faction_conflict',
            factions: [name, otherName],
            severity: 'escalating',
            autoTrigger: true
          });
        }
      });
    });

    // Tension overflow
    Object.entries(this.tensions).forEach(([tension, level]) => {
      if (level > 80) {
        events.push({
          type: 'tension_overflow',
          tension: tension,
          severity: 'catastrophic',
          autoTrigger: true
        });
      }
    });

    return events;
  }

  // STATE EVOLUTION - World changes over time
  tick() {
    // Resources decline
    Object.values(this.resources).forEach(r => {
      if (r.trend === 'declining') r.amount = Math.max(0, r.amount - 1);
      if (r.trend === 'critical') r.amount = Math.max(0, r.amount - 2);
    });

    // Tensions rise naturally
    if (this.resources.food.amount < 30) {
      this.tensions.food_shortage = Math.min(100, this.tensions.food_shortage + 3);
    }

    // Faction relationships drift
    Object.values(this.factions).forEach(faction => {
      Object.keys(faction.relationships).forEach(other => {
        // Small random drift creates unpredictability
        const drift = (Math.random() - 0.5) * 2;
        faction.relationships[other] = Math.max(-100, Math.min(100, 
          faction.relationships[other] + drift
        ));
      });
    });
  }

  // APPLY CHOICE CONSEQUENCES
  applyChoice(choice) {
    if (choice.worldEffects) {
      // Resource changes
      if (choice.worldEffects.resources) {
        Object.entries(choice.worldEffects.resources).forEach(([res, change]) => {
          this.resources[res].amount = Math.max(0, this.resources[res].amount + change);
        });
      }

      // Faction changes
      if (choice.worldEffects.factions) {
        Object.entries(choice.worldEffects.factions).forEach(([faction, changes]) => {
          if (changes.loyalty !== undefined) {
            this.factions[faction].loyalty = Math.max(0, Math.min(100,
              this.factions[faction].loyalty + changes.loyalty
            ));
          }
          if (changes.relationships) {
            Object.entries(changes.relationships).forEach(([other, change]) => {
              this.factions[faction].relationships[other] += change;
            });
          }
        });
      }

      // World scars
      if (choice.worldEffects.scars) {
        choice.worldEffects.scars.forEach(scar => this.scars.add(scar));
      }
    }
  }
}
```

---

## 👤 LAYER 2: PLAYER PERSONALITY PROFILING

### Deep Player Understanding

```javascript
class PlayerProfile {
  constructor(playerId) {
    this.id = playerId;
    
    // PERSONALITY VECTORS (learned from choices)
    this.traits = {
      // Risk-taking: 0 (cautious) to 100 (reckless)
      riskTaking: 50,
      
      // Cooperation: 0 (selfish) to 100 (altruistic)
      cooperation: 50,
      
      // Morality: 0 (pragmatic) to 100 (idealistic)
      morality: 50,
      
      // Leadership: 0 (follower) to 100 (decisive leader)
      leadership: 50,
      
      // Curiosity: 0 (focused) to 100 (exploratory)
      curiosity: 50,
      
      // Emotional: 0 (logical) to 100 (emotional)
      emotional: 50
    };

    // ARCHETYPAL CLASSIFICATION
    this.archetypes = {
      primary: null,    // Calculated from traits
      secondary: null,
      evolution: []     // How archetype changed over time
    };

    // CHOICE PATTERNS
    this.patterns = {
      favorsGenre: null,          // Which genre they choose most
      avoidGenre: null,           // Which they avoid
      averageDecisionTime: 0,     // How long they think
      changesVote: 0,             // How often they switch
      controversialChoices: 0     // How often they pick the minority
    };

    // RELATIONSHIP TRACKING
    this.bonds = {
      // NPC relationships: name -> strength (-100 to 100)
    };

    // HISTORICAL DATA
    this.history = {
      sessionsPlayed: 0,
      endings: [],
      favoriteStories: [],
      traumaticMoments: [],    // Scenes that affected them
      heroicMoments: [],
      betrayals: 0
    };

    // PREDICTION MODEL
    this.predictions = {
      nextChoice: null,
      confidence: 0
    };
  }

  // UPDATE PROFILE BASED ON CHOICE
  updateFromChoice(choice, context) {
    // Analyze choice characteristics
    const analysis = this.analyzeChoice(choice, context);
    
    // Update traits (gradual learning)
    const learningRate = 0.05;  // Slow adaptation
    
    if (analysis.isRisky) {
      this.traits.riskTaking += (100 - this.traits.riskTaking) * learningRate;
    } else {
      this.traits.riskTaking += (0 - this.traits.riskTaking) * learningRate;
    }

    if (analysis.isCooperative) {
      this.traits.cooperation += (100 - this.traits.cooperation) * learningRate;
    } else {
      this.traits.cooperation += (0 - this.traits.cooperation) * learningRate;
    }

    if (analysis.isMoral) {
      this.traits.morality += (100 - this.traits.morality) * learningRate;
    } else {
      this.traits.morality += (0 - this.traits.morality) * learningRate;
    }

    // Update archetype
    this.recalculateArchetype();
  }

  analyzeChoice(choice, context) {
    return {
      isRisky: choice.consequences?.risk > 50,
      isCooperative: choice.worldEffects?.factions && 
                     Object.values(choice.worldEffects.factions).some(f => f.loyalty > 0),
      isMoral: choice.moralWeight > 0,
      isSelfish: choice.worldEffects?.personal?.benefit > choice.worldEffects?.group?.benefit
    };
  }

  recalculateArchetype() {
    const { riskTaking, cooperation, morality, leadership } = this.traits;

    // Calculate primary archetype
    if (leadership > 70 && morality > 60) {
      this.archetypes.primary = 'The Hero';
    } else if (riskTaking > 70 && cooperation < 40) {
      this.archetypes.primary = 'The Renegade';
    } else if (morality > 70 && cooperation > 70) {
      this.archetypes.primary = 'The Peacekeeper';
    } else if (riskTaking < 30 && morality > 60) {
      this.archetypes.primary = 'The Survivor';
    } else if (cooperation < 40 && morality < 40) {
      this.archetypes.primary = 'The Opportunist';
    } else if (leadership < 40 && cooperation > 60) {
      this.archetypes.primary = 'The Supporter';
    } else {
      this.archetypes.primary = 'The Pragmatist';
    }

    // Track archetype evolution
    const lastArchetype = this.archetypes.evolution[this.archetypes.evolution.length - 1];
    if (!lastArchetype || lastArchetype.archetype !== this.archetypes.primary) {
      this.archetypes.evolution.push({
        archetype: this.archetypes.primary,
        timestamp: Date.now(),
        traits: {...this.traits}
      });
    }
  }

  // PREDICT NEXT CHOICE
  predictNextChoice(choices, context) {
    // Score each choice based on player's traits
    const scores = choices.map(choice => {
      let score = 0;
      const analysis = this.analyzeChoice(choice, context);

      // Weight by personality
      if (analysis.isRisky) score += this.traits.riskTaking / 100;
      if (analysis.isCooperative) score += this.traits.cooperation / 100;
      if (analysis.isMoral) score += this.traits.morality / 100;

      // Weight by past patterns
      if (this.patterns.favorsGenre && choice.genre === this.patterns.favorsGenre) {
        score += 0.3;
      }

      return { choice, score };
    });

    const best = scores.sort((a, b) => b.score - a.score)[0];
    
    this.predictions = {
      nextChoice: best.choice.id,
      confidence: Math.min(100, best.score * 100),
      alternatives: scores.slice(1, 3).map(s => s.choice.id)
    };

    return this.predictions;
  }

  // GENERATE PERSONALIZED CONTENT HOOKS
  getPersonalizedHooks() {
    const hooks = [];

    // Archetype-specific hooks
    if (this.archetypes.primary === 'The Hero') {
      hooks.push({
        type: 'responsibility',
        text: 'People are counting on you to lead them through this.',
        weight: 1.5
      });
    }

    // Trauma callbacks
    this.history.traumaticMoments.forEach(trauma => {
      hooks.push({
        type: 'trauma_callback',
        text: `This reminds you of ${trauma.event}...`,
        weight: 1.2,
        emotional: true
      });
    });

    // Relationship-driven
    Object.entries(this.bonds).forEach(([npc, strength]) => {
      if (strength > 50) {
        hooks.push({
          type: 'relationship',
          text: `${npc} trusts you. Don't let them down.`,
          weight: 1.3
        });
      }
    });

    return hooks;
  }
}
```

---

## 🎬 LAYER 3: NARRATIVE DIRECTOR

### The Brain That Chooses What Happens Next

```javascript
class NarrativeDirector {
  constructor(worldState, playerProfiles) {
    this.world = worldState;
    this.players = playerProfiles;
    
    // PACING ENGINE
    this.pacing = {
      currentIntensity: 0,      // 0-100
      targetIntensity: 50,
      lastMajorEvent: null,
      scenesSinceAction: 0,
      emotionalCurve: []        // Track ups and downs
    };

    // NARRATIVE MEMORY
    this.narrative = {
      activeThreads: [],        // Ongoing plot threads
      unresolved: [],           // Chekhov's guns
      foreshadowing: [],        // Seeds for future payoff
      callbacks: []             // References to past events
    };
  }

  // MAIN DECISION FUNCTION: What scene comes next?
  selectNextScene(scenePool, context) {
    // Step 1: Filter candidates by conditions
    const eligible = this.filterEligibleScenes(scenePool, context);
    
    if (eligible.length === 0) {
      // Emergency: generate procedural scene
      return this.generateProceduralScene(context);
    }

    // Step 2: Check for emergent events (override normal flow)
    const emergentEvents = this.world.checkEmergentEvents();
    if (emergentEvents.length > 0 && Math.random() < 0.7) {
      return this.createEmergentScene(emergentEvents[0], eligible);
    }

    // Step 3: Score eligible scenes
    const scored = eligible.map(scene => ({
      scene,
      score: this.scoreScene(scene, context)
    }));

    // Step 4: Apply pacing adjustments
    scored.forEach(s => {
      s.score *= this.getPacingMultiplier(s.scene);
    });

    // Step 5: Add randomness (prevent total predictability)
    scored.forEach(s => {
      s.score *= (0.8 + Math.random() * 0.4);  // ±20% variance
    });

    // Step 6: Pick winner
    const winner = scored.sort((a, b) => b.score - a.score)[0];

    // Step 7: Update pacing state
    this.updatePacing(winner.scene);

    return winner.scene;
  }

  filterEligibleScenes(scenePool, context) {
    return scenePool.filter(scene => {
      // Check requirements
      if (scene.requires) {
        // World scars
        if (scene.requires.scars) {
          const hasAllScars = scene.requires.scars.every(scar => 
            this.world.scars.has(scar)
          );
          if (!hasAllScars) return false;
        }

        // Faction state
        if (scene.requires.factions) {
          const factionsMet = Object.entries(scene.requires.factions).every(([name, req]) => {
            const faction = this.world.factions[name];
            if (!faction) return false;
            if (req.minLoyalty && faction.loyalty < req.minLoyalty) return false;
            if (req.maxLoyalty && faction.loyalty > req.maxLoyalty) return false;
            return true;
          });
          if (!factionsMet) return false;
        }

        // Resource requirements
        if (scene.requires.resources) {
          const resourcesMet = Object.entries(scene.requires.resources).every(([res, min]) => {
            return this.world.resources[res].amount >= min;
          });
          if (!resourcesMet) return false;
        }

        // Player archetype
        if (scene.requires.playerArchetype) {
          const hasArchetype = this.players.some(p => 
            p.archetypes.primary === scene.requires.playerArchetype
          );
          if (!hasArchetype) return false;
        }
      }

      // Check prohibitions
      if (scene.prohibits) {
        if (scene.prohibits.scars) {
          const hasProhibitedScar = scene.prohibits.scars.some(scar => 
            this.world.scars.has(scar)
          );
          if (hasProhibitedScar) return false;
        }
      }

      return true;
    });
  }

  scoreScene(scene, context) {
    let score = scene.baseWeight || 1.0;

    // GENRE ALIGNMENT with current Rift balance
    if (context.dominantGenre && scene.genres) {
      const genreMatch = scene.genres.includes(context.dominantGenre);
      score *= genreMatch ? 1.5 : 0.7;
    }

    // PLAYER PERSONALITY FIT
    this.players.forEach(player => {
      if (scene.appealsTo) {
        const traitMatch = scene.appealsTo.some(trait => 
          player.traits[trait] > 60
        );
        if (traitMatch) score *= 1.3;
      }
    });

    // NARRATIVE THREADING (payoffs are better)
    if (scene.payoffFor) {
      const hasThread = this.narrative.activeThreads.some(t => 
        scene.payoffFor.includes(t.id)
      );
      if (hasThread) score *= 2.0;  // Big boost for payoffs
    }

    // FRESHNESS (avoid repetition)
    const timesPlayed = context.sessionHistory.filter(s => s === scene.id).length;
    score *= Math.max(0.3, 1 - (timesPlayed * 0.2));

    // RARITY BONUS (encourage unique paths)
    if (scene.rarity === 'rare' && Math.random() < 0.1) {
      score *= 3.0;
    }

    // WORLD STATE RELEVANCE
    if (scene.reactsTo) {
      Object.entries(scene.reactsTo).forEach(([state, condition]) => {
        const worldValue = this.world.tensions[state] || 0;
        if (condition.min && worldValue >= condition.min) score *= 1.5;
        if (condition.max && worldValue <= condition.max) score *= 1.5;
      });
    }

    return score;
  }

  getPacingMultiplier(scene) {
    const intensityDelta = scene.intensity - this.pacing.currentIntensity;
    
    // Prefer scenes that move toward target intensity
    const targetDelta = Math.abs(scene.intensity - this.pacing.targetIntensity);
    const currentDelta = Math.abs(this.pacing.currentIntensity - this.pacing.targetIntensity);
    
    if (targetDelta < currentDelta) {
      return 1.5;  // Moving toward target
    }

    // Don't spike too fast
    if (intensityDelta > 40) {
      return 0.5;
    }

    // Don't stay flat too long
    if (this.pacing.scenesSinceAction > 3 && scene.intensity > 60) {
      return 2.0;
    }

    return 1.0;
  }

  updatePacing(scene) {
    this.pacing.currentIntensity = scene.intensity;
    this.pacing.emotionalCurve.push(scene.intensity);
    
    if (scene.intensity > 70) {
      this.pacing.lastMajorEvent = scene.id;
      this.pacing.scenesSinceAction = 0;
    } else {
      this.pacing.scenesSinceAction++;
    }

    // Adjust target for natural flow
    if (this.pacing.scenesSinceAction > 2) {
      this.pacing.targetIntensity = 70;  // Time for action
    } else if (this.pacing.currentIntensity > 80) {
      this.pacing.targetIntensity = 40;  // Need cooldown
    }
  }

  // EMERGENT SCENE GENERATION
  createEmergentScene(event, baseScenes) {
    // Find a base scene to modify
    const base = baseScenes[Math.floor(Math.random() * baseScenes.length)];
    
    return {
      ...base,
      id: `emergent_${event.type}_${Date.now()}`,
      emergent: true,
      event: event,
      intensity: Math.min(100, base.intensity + 20),
      text: `[EMERGENT EVENT: ${event.type}] ${base.text}`,
      // This will be enhanced by AI later
    };
  }

  generateProceduralScene(context) {
    // Emergency fallback: create basic scene from templates
    return {
      id: `procedural_${Date.now()}`,
      procedural: true,
      text: 'The story takes an unexpected turn...',
      intensity: 50,
      choices: [
        { id: 'p1', text: 'Continue cautiously' },
        { id: 'p2', text: 'Take bold action' },
        { id: 'p3', text: 'Seek allies' }
      ]
    };
  }
}
```

---

## 🤖 LAYER 4: AI CONTENT GENERATION

### Using Claude to Create Unique Variations

```javascript
class AIContentGenerator {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.cache = new Map();  // Cache generated content
  }

  async enhanceScene(baseScene, worldState, playerProfiles, context) {
    // Build rich prompt from all game state
    const prompt = this.buildScenePrompt(baseScene, worldState, playerProfiles, context);
    
    // Check cache first
    const cacheKey = this.getCacheKey(prompt);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Generate with Claude
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    const data = await response.json();
    const enhanced = this.parseAIResponse(data.content[0].text, baseScene);
    
    // Cache it
    this.cache.set(cacheKey, enhanced);
    
    return enhanced;
  }

  buildScenePrompt(baseScene, worldState, playerProfiles, context) {
    const primaryPlayer = playerProfiles[0];  // Focus on primary player
    
    return `You are the Narrative Director for "The Rift", a self-evolving story game.

SCENE TEMPLATE:
${baseScene.text}

CURRENT WORLD STATE:
- Dominant Genre: ${context.dominantGenre}
- Chaos Level: ${worldState.meta.chaosLevel}%
- Active Scars: ${Array.from(worldState.scars).join(', ') || 'none'}
- Food Supply: ${worldState.resources.food.amount}% (${worldState.resources.food.trend})
- Faction Tensions:
  ${Object.entries(worldState.factions).map(([name, f]) => 
    `  * ${name}: Loyalty ${f.loyalty}%, Power ${f.power}%`
  ).join('\n')}
- Critical Tensions: ${Object.entries(worldState.tensions)
    .filter(([k, v]) => v > 50)
    .map(([k, v]) => `${k}:${v}%`)
    .join(', ') || 'none'}

PLAYER PROFILE:
- Archetype: ${primaryPlayer.archetypes.primary}
- Traits: Risk-taking: ${primaryPlayer.traits.riskTaking}, Cooperation: ${primaryPlayer.traits.cooperation}
- Previous Ending: ${primaryPlayer.history.endings[primaryPlayer.history.endings.length - 1] || 'none'}
- Key Relationships: ${Object.entries(primaryPlayer.bonds)
    .filter(([n, s]) => Math.abs(s) > 40)
    .map(([n, s]) => `${n} (${s > 0 ? 'trusted' : 'distrusted'})`)
    .join(', ') || 'none'}

TASK:
Rewrite the scene template to:
1. Reflect the current world state naturally (mention faction dynamics, resource scarcity, past scars)
2. Include personalized hooks for the player's archetype
3. Maintain the ${context.dominantGenre} genre tone with potential Rift interference
4. Reference at least one element from player history if relevant
5. Keep the core narrative beat but make it feel fresh and reactive

CONSTRAINTS:
- Keep the same general structure (intro, complication, choice point)
- Don't exceed ${baseScene.maxLength || 500} characters
- Maintain the base genre while allowing contamination
- Ensure all NPCs act consistently with their faction's current state

OUTPUT FORMAT (JSON):
{
  "sceneText": "The rewritten scene text here...",
  "npcDialogue": {
    "speaker": "name",
    "line": "what they say",
    "tone": "their emotional state"
  },
  "atmosphereNotes": "Brief description of mood/setting changes",
  "playerHook": "Why this matters to THIS specific player"
}`;
  }

  parseAIResponse(text, baseScene) {
    try {
      // Try to parse as JSON
      const json = JSON.parse(text);
      return {
        ...baseScene,
        text: json.sceneText,
        npcDialogue: json.npcDialogue,
        atmosphere: json.atmosphereNotes,
        personalHook: json.playerHook,
        aiGenerated: true
      };
    } catch (e) {
      // Fallback: use as plain text
      return {
        ...baseScene,
        text: text,
        aiGenerated: true
      };
    }
  }

  getCacheKey(prompt) {
    // Simple hash for caching
    return prompt.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0).toString(36);
  }

  // Generate NPC dialogue on the fly
  async generateNPCResponse(npc, situation, worldState, playerProfile) {
    const prompt = `NPC: ${npc.name} (${npc.role})
Personality: ${npc.traits.join(', ')}
Current Mood: ${npc.currentMood}
Loyalty to player: ${playerProfile.bonds[npc.name] || 0}/100

SITUATION: ${situation}

WORLD CONTEXT:
- ${npc.faction} faction loyalty: ${worldState.factions[npc.faction].loyalty}%
- Food shortage tension: ${worldState.tensions.food_shortage}%
- Previous interaction with player: ${playerProfile.history.lastInteraction[npc.name] || 'first meeting'}

Generate a single line of dialogue (max 100 characters) that ${npc.name} would say in this situation, reflecting their personality and current world state. Make it feel natural and reactive.

OUTPUT (plain text, just the dialogue):`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    return data.content[0].text.trim();
  }
}
```

---

## 🎯 PUTTING IT ALL TOGETHER

### The Game Loop

```javascript
class TheLivingRift {
  constructor() {
    this.worldState = new WorldState();
    this.playerProfiles = new Map();
    this.director = new NarrativeDirector(this.worldState, []);
    this.aiGenerator = new AIContentGenerator(API_KEY);
    this.scenePool = this.loadScenePool();
  }

  async startSession(playerIds) {
    // Load or create player profiles
    this.playerProfiles = new Map(
      playerIds.map(id => [id, this.loadOrCreateProfile(id)])
    );

    // Update director with current players
    this.director.players = Array.from(this.playerProfiles.values());

    // Begin story
    return await this.nextScene();
  }

  async nextScene(previousChoice = null) {
    // 1. Apply choice consequences
    if (previousChoice) {
      this.worldState.applyChoice(previousChoice);
      
      // Update player profiles
      this.playerProfiles.forEach(player => {
        player.updateFromChoice(previousChoice, {
          world: this.worldState,
          scene: this.currentScene
        });
      });
    }

    // 2. Tick world state (time passes)
    this.worldState.tick();

    // 3. Let the director choose next scene
    const context = {
      dominantGenre: this.getCurrentDominantGenre(),
      sessionHistory: this.getSessionHistory(),
      playerCount: this.playerProfiles.size
    };

    const baseScene = this.director.selectNextScene(this.scenePool, context);

    // 4. AI enhancement (make it unique)
    const enhancedScene = await this.aiGenerator.enhanceScene(
      baseScene,
      this.worldState,
      Array.from(this.playerProfiles.values()),
      context
    );

    // 5. Personalize choices for players
    const personalizedChoices = this.personalizeChoices(
      enhancedScene.choices,
      this.playerProfiles
    );

    enhancedScene.choices = personalizedChoices;

    // 6. Store as current scene
    this.currentScene = enhancedScene;

    return enhancedScene;
  }

  personalizeChoices(baseChoices, playerProfiles) {
    return baseChoices.map(choice => {
      const enhanced = { ...choice };
      
      // Add personalized flavor text for each player
      enhanced.personalHooks = {};
      
      playerProfiles.forEach((profile, playerId) => {
        const hooks = profile.getPersonalizedHooks();
        const relevantHook = hooks.find(h => 
          // Match hook to choice characteristics
          (choice.isRisky && h.type === 'responsibility') ||
          (choice.isEmotional && h.type === 'relationship')
        );
        
        if (relevantHook) {
          enhanced.personalHooks[playerId] = relevantHook.text;
        }
      });

      return enhanced;
    });
  }

  // Save everything for next session
  async endSession() {
    // Save world state
    await this.saveWorldState(this.worldState);
    
    // Save all player profiles
    for (const [id, profile] of this.playerProfiles) {
      await this.savePlayerProfile(id, profile);
    }

    // Generate session summary
    return {
      ending: this.worldState.determineEnding(),
      playerArchetypes: Array.from(this.playerProfiles.values()).map(p => p.archetypes.primary),
      worldChanges: Array.from(this.worldState.scars),
      nextEpisodeHook: await this.generateNextEpisodeHook()
    };
  }

  async generateNextEpisodeHook() {
    // Use AI to create compelling hook based on current state
    const prompt = `Based on this game session state, write a compelling 2-sentence hook for the next episode:

World Scars: ${Array.from(this.worldState.scars).join(', ')}
Major Tensions: ${Object.entries(this.worldState.tensions)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 2)
  .map(([k, v]) => `${k} (${v}%)`)
  .join(', ')}
Faction Leaders: ${Object.entries(this.worldState.factions)
  .map(([name, f]) => `${name} led by ${f.leader || 'unknown'}`)
  .join(', ')}

Make it mysterious and compelling.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiGenerator.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    return data.content[0].text.trim();
  }
}
```

This is the foundation of a truly self-evolving story engine. Want me to build the scene pool structure next, showing exactly how to define scenes that work with this system?
