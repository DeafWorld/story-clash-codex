# SCENE POOL ARCHITECTURE
## How to Define Scenes for Self-Evolution

---

## 🎭 SCENE DEFINITION STRUCTURE

### Basic Scene Schema

```json
{
  "id": "medical_crisis_1",
  "title": "The Infection Spreads",
  
  "baseWeight": 1.0,
  "rarity": "common",
  
  "intensity": 70,
  "genres": ["horror", "scifi"],
  
  "requires": {
    "scars": [],
    "resources": {
      "medicine": 20
    },
    "factions": {
      "scientists": {
        "minLoyalty": 30
      }
    },
    "playerArchetype": null,
    "minChaos": 0,
    "maxChaos": 100
  },
  
  "prohibits": {
    "scars": ["dr_chen_dead", "medical_bay_destroyed"]
  },
  
  "appealsTo": ["cooperation", "morality"],
  
  "text": "Dr. Chen bursts into the common room, face pale. 'We have a problem. Three more infected. The quarantine isn't holding.' The scientists' faction is losing control, and you can see the fear spreading faster than the disease itself.",
  
  "maxLength": 500,
  
  "reactsTo": {
    "disease_outbreak": {
      "min": 40,
      "textModifier": "The disease has reached critical levels."
    },
    "morale_crisis": {
      "min": 60,
      "textModifier": "Panic is setting in among the survivors."
    }
  },
  
  "choices": [
    {
      "id": "choice_lockdown",
      "text": "Enforce total lockdown - no one in or out",
      "flavorText": "It's harsh, but it might save everyone",
      "genre": "horror",
      
      "isRisky": false,
      "isCooperative": false,
      "isMoral": true,
      "moralWeight": 60,
      
      "consequences": {
        "risk": 30,
        "sceneTransition": "lockdown_consequences",
        
        "worldEffects": {
          "resources": {
            "medicine": -10
          },
          "factions": {
            "survivors": {
              "loyalty": -20,
              "relationships": {
                "scientists": 10
              }
            },
            "scientists": {
              "loyalty": 10
            }
          },
          "scars": ["enforced_lockdown"],
          "tensions": {
            "disease_outbreak": -20,
            "morale_crisis": 15
          }
        }
      },
      
      "personalHooks": {
        "The Hero": "This is what leaders do - make the hard calls.",
        "The Peacekeeper": "There must be another way that doesn't divide everyone.",
        "The Survivor": "Survival requires sacrifice."
      }
    },
    
    {
      "id": "choice_trust_chen",
      "text": "Let Dr. Chen handle it - trust the scientists",
      "flavorText": "They know what they're doing... right?",
      "genre": "scifi",
      
      "isRisky": true,
      "isCooperative": true,
      "isMoral": true,
      "moralWeight": 70,
      
      "consequences": {
        "risk": 60,
        "sceneTransition": "chen_protocol",
        
        "worldEffects": {
          "resources": {
            "medicine": -15
          },
          "factions": {
            "scientists": {
              "loyalty": 20,
              "power": 10,
              "relationships": {
                "survivors": 15
              }
            }
          },
          "tensions": {
            "disease_outbreak": -10
          }
        }
      }
    },
    
    {
      "id": "choice_radical",
      "text": "Evacuate the infected to the outer perimeter",
      "flavorText": "Protect the majority, even if it means...",
      "genre": "horror",
      
      "isRisky": true,
      "isCooperative": false,
      "isMoral": false,
      "moralWeight": -40,
      
      "consequences": {
        "risk": 70,
        "sceneTransition": "exile_infected",
        
        "worldEffects": {
          "factions": {
            "survivors": {
              "loyalty": -30
            },
            "scientists": {
              "loyalty": -40,
              "relationships": {
                "survivors": -30
              }
            }
          },
          "scars": ["exiled_infected"],
          "tensions": {
            "disease_outbreak": -30,
            "faction_conflict": 40,
            "morale_crisis": 25
          }
        },
        
        "secretRevealed": "exile_creates_raiders"
      }
    }
  ],
  
  "payoffFor": [],
  
  "foreshadows": ["scientist_rebellion", "infection_mutation"]
}
```

---

## 🔗 ADVANCED SCENE TYPES

### 1. Conditional Branching Scene

```json
{
  "id": "faction_showdown_1",
  "title": "The Breaking Point",
  
  "intensity": 85,
  "genres": ["drama", "thriller"],
  
  "requires": {
    "factions": {
      "survivors": {
        "minLoyalty": 0,
        "relationships": {
          "military": -40
        }
      },
      "military": {
        "minLoyalty": 0
      }
    },
    "minChaos": 60
  },
  
  "variants": [
    {
      "condition": "worldState.factions.military.power > worldState.factions.survivors.power + 20",
      "text": "Commander Shaw stands at the armory door, rifle in hand. 'This ends now. We're taking control. For everyone's safety.' The military has the upper hand - resistance would be suicide.",
      "choices": ["submit", "negotiate", "call_bluff"]
    },
    {
      "condition": "worldState.factions.survivors.loyalty > 60",
      "text": "Commander Shaw approaches, but your people stand with you. 'We won't be ruled by fear,' someone shouts. Shaw hesitates - a fight here could destroy what's left of the group.",
      "choices": ["stand_firm", "compromise", "escalate"]
    },
    {
      "condition": "default",
      "text": "Commander Shaw and the survivors' spokesperson face off in the common room. Everyone's watching. Everyone's choosing sides. This is the moment everything changes.",
      "choices": ["mediate", "side_military", "side_survivors", "create_third_option"]
    }
  ],
  
  "dynamicChoices": {
    "generateFrom": "worldState.factions",
    "template": {
      "id": "ally_with_FACTION",
      "text": "Side with FACTION_NAME",
      "worldEffects": {
        "factions": {
          "FACTION_ID": {
            "loyalty": 30,
            "power": 20
          }
        }
      }
    }
  }
}
```

### 2. Payoff Scene (Resolves Earlier Threads)

```json
{
  "id": "chen_betrayal_reveal",
  "title": "The Truth Comes Out",
  
  "intensity": 90,
  "rarity": "rare",
  
  "requires": {
    "scars": ["trusted_chen_with_samples"],
    "minChaos": 40
  },
  
  "payoffFor": ["chen_secret_research", "missing_supplies"],
  
  "text": "You find Dr. Chen in the restricted lab. The missing supplies. The secret transmissions. It all makes sense now. 'I had to,' she says, not meeting your eyes. 'The Foundation promised extraction - for those who could deliver results.' She's been selling your survival data to the highest bidder.",
  
  "choices": [
    {
      "id": "expose_chen",
      "text": "Expose her to everyone",
      "worldEffects": {
        "factions": {
          "scientists": {
            "loyalty": -50,
            "leader": null
          }
        },
        "scars": ["chen_exposed"],
        "tensions": {
          "faction_conflict": 30,
          "morale_crisis": 20
        }
      },
      "narrativeEffect": {
        "closeThread": "chen_secret_research",
        "openThread": "scientist_leadership_vacuum"
      }
    },
    
    {
      "id": "confront_privately",
      "text": "Confront her privately - this stays between you",
      "worldEffects": {
        "scars": ["chen_compromised"]
      },
      "relationshipEffect": {
        "dr_chen": -80
      },
      "narrativeEffect": {
        "modifyThread": "chen_secret_research",
        "addSecret": "player_knows_chen_betrayal"
      }
    },
    
    {
      "id": "use_leverage",
      "text": "Use this as leverage - she works for YOU now",
      "worldEffects": {
        "scars": ["blackmailing_chen"]
      },
      "relationshipEffect": {
        "dr_chen": -50
      },
      "unlock": {
        "scenes": ["chen_forced_cooperation"],
        "abilities": ["command_chen"]
      }
    }
  ],
  
  "callbacks": [
    {
      "condition": "playerProfile.history.traumaticMoments.includes('betrayal')",
      "addText": "Not again. You swore after last time you'd never let anyone betray you again."
    }
  ]
}
```

### 3. Emergent Event Scene Template

```json
{
  "id": "resource_riot_template",
  "type": "emergent",
  "title": "RESOURCE Riot",
  
  "triggers": {
    "event": "resource_crisis",
    "severity": "critical"
  },
  
  "textTemplate": "Chaos erupts in the storage area. 'There's not enough {RESOURCE} for everyone!' someone shouts. Hands grab at what's left. This is how civilizations collapse - not with a bang, but with desperate people fighting over {RESOURCE}.",
  
  "dynamicElements": {
    "RESOURCE": "event.resource",
    "SEVERITY": "event.severity",
    "INSTIGATOR": "worldState.factions[lowestLoyalty].leader || 'an angry survivor'"
  },
  
  "aiEnhancement": {
    "required": true,
    "prompt": "Rewrite this riot scene focusing on the {RESOURCE} scarcity. Make it visceral and immediate. Reference the {INSTIGATOR} character if they exist in world state."
  },
  
  "proceduralChoices": {
    "generate": true,
    "count": 3,
    "types": ["authoritarian", "diplomatic", "risky_creative"],
    "template": {
      "authoritarian": {
        "pattern": "Use force to restore order",
        "consequences": {
          "tensions": {
            "morale_crisis": 20
          },
          "factions": {
            "military": {
              "loyalty": 10
            }
          }
        }
      },
      "diplomatic": {
        "pattern": "Negotiate a fair distribution system",
        "consequences": {
          "tensions": {
            "morale_crisis": -10
          },
          "resources": {
            "{RESOURCE}": -5
          }
        }
      },
      "risky_creative": {
        "aiGenerated": true,
        "prompt": "Generate a creative solution to this {RESOURCE} riot that's risky but potentially brilliant"
      }
    }
  }
}
```

### 4. Callback Scene (References Player History)

```json
{
  "id": "familiar_face_returns",
  "title": "Ghost from the Past",
  
  "intensity": 60,
  "genres": ["drama", "mystery"],
  
  "requires": {
    "playerHistory": {
      "minSessions": 3,
      "hasEnding": ["betrayal_ending", "sacrifice_ending"]
    }
  },
  
  "personalizedIntro": {
    "generateFrom": "playerProfile.history.traumaticMoments",
    "template": "Remember {PAST_EVENT}? Remember {NPC_NAME}? They're back."
  },
  
  "npcGeneration": {
    "selectFrom": "playerProfile.history.significantNPCs",
    "condition": "npc.fate === 'unknown' || npc.fate === 'presumed_dead'",
    "aiPrompt": "This NPC from the player's history is returning. Describe their current state based on how they parted: {PARTING_CIRCUMSTANCES}"
  },
  
  "text": "{AI_GENERATED_NPC_RETURN}",
  
  "choices": [
    {
      "id": "trust_them",
      "condition": "playerProfile.bonds[npcId] > 0",
      "text": "Welcome them back - you need allies"
    },
    {
      "id": "suspicious",
      "condition": "playerProfile.bonds[npcId] < 0",
      "text": "Keep them at arm's length - they left before"
    },
    {
      "id": "neutral",
      "text": "Hear them out, then decide"
    }
  ]
}
```

---

## 🌳 SCENE POOL ORGANIZATION

### Tiered System

```javascript
const scenePool = {
  // CORE SCENES (always available)
  core: [
    {
      id: 'intro_scene',
      // ... scene definition
    }
  ],
  
  // CONDITIONAL SCENES (require specific state)
  conditional: [
    {
      id: 'faction_war_begins',
      requires: { /* ... */ }
    }
  ],
  
  // PAYOFF SCENES (resolve narrative threads)
  payoffs: [
    {
      id: 'chen_betrayal_reveal',
      payoffFor: ['chen_secret_research']
    }
  ],
  
  // EMERGENT TEMPLATES (generated on the fly)
  emergent: [
    {
      id: 'resource_riot_template',
      type: 'emergent'
    }
  ],
  
  // CALLBACK SCENES (personalized to player)
  callbacks: [
    {
      id: 'familiar_face_returns',
      requires: { playerHistory: { /* ... */ } }
    }
  ],
  
  // RARE SCENES (low probability, high impact)
  rare: [
    {
      id: 'rift_convergence_event',
      rarity: 'legendary',
      probability: 0.05
    }
  ]
};
```

---

## 🎲 PROCEDURAL CHOICE GENERATION

### Dynamic Choice Builder

```javascript
class ProceduralChoiceGenerator {
  async generateChoices(scene, worldState, playerProfile) {
    const choices = [];
    
    // Add base choices
    if (scene.choices) {
      choices.push(...scene.choices);
    }
    
    // Generate faction-specific choices
    if (scene.allowsFactionChoices) {
      Object.entries(worldState.factions).forEach(([name, faction]) => {
        if (faction.loyalty > 40) {
          choices.push({
            id: `ally_${name}`,
            text: `Ask ${name} for help`,
            dynamic: true,
            worldEffects: {
              factions: {
                [name]: {
                  loyalty: -10,  // Asking for help costs loyalty
                  power: 5       // But increases their power
                }
              }
            }
          });
        }
      });
    }
    
    // Generate resource-based choices
    if (scene.allowsResourceChoices) {
      Object.entries(worldState.resources).forEach(([resource, data]) => {
        if (data.amount > 30) {
          choices.push({
            id: `spend_${resource}`,
            text: `Use ${resource} to solve this (${data.amount} available)`,
            dynamic: true,
            worldEffects: {
              resources: {
                [resource]: -20
              }
            }
          });
        }
      });
    }
    
    // Generate AI-assisted choices
    if (scene.allowsAIChoices) {
      const aiChoice = await this.generateAIChoice(scene, worldState, playerProfile);
      if (aiChoice) {
        choices.push(aiChoice);
      }
    }
    
    return choices;
  }
  
  async generateAIChoice(scene, worldState, playerProfile) {
    const prompt = `You are generating a unique choice for a story game.

SCENE: ${scene.text}

PLAYER ARCHETYPE: ${playerProfile.archetypes.primary}

WORLD STATE:
- Resources critical: ${Object.entries(worldState.resources)
  .filter(([r, d]) => d.amount < 30)
  .map(([r]) => r)
  .join(', ')}
- Faction tensions: ${Object.entries(worldState.factions)
  .map(([name, f]) => `${name}:${f.loyalty}%`)
  .join(', ')}

Generate ONE creative choice that:
1. The player's archetype would find appealing
2. Addresses current world problems in an unexpected way
3. Has meaningful consequences
4. Feels organic to the scene

OUTPUT JSON:
{
  "id": "ai_choice_unique_id",
  "text": "The choice text (max 100 chars)",
  "flavorText": "Why this is interesting (max 80 chars)",
  "consequences": {
    "risk": 0-100,
    "worldEffects": {
      // what changes in the world
    }
  },
  "reasoning": "Why this choice makes sense"
}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': AI_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      
      const data = await response.json();
      const generated = JSON.parse(data.content[0].text);
      
      return {
        ...generated,
        aiGenerated: true,
        generationReasoning: generated.reasoning
      };
    } catch (e) {
      console.error('AI choice generation failed', e);
      return null;
    }
  }
}
```

---

## 🔄 NARRATIVE THREAD SYSTEM

### How Threads Create Continuity

```javascript
class NarrativeThread {
  constructor(id, type, priority) {
    this.id = id;
    this.type = type;  // 'mystery', 'conflict', 'relationship', 'quest'
    this.priority = priority;  // 1-10
    
    this.status = 'active';  // 'active', 'resolved', 'abandoned', 'dormant'
    
    this.seeds = [];  // Scenes that introduced this
    this.developments = [];  // Scenes that advanced it
    this.payoff = null;  // Scene that resolves it
    
    this.clues = [];  // Hints dropped along the way
    this.playerAwareness = 0;  // How much do players know? 0-100
    
    this.metadata = {
      created: Date.now(),
      lastMention: Date.now(),
      scenesSinceMention: 0
    };
  }
  
  // Add development to thread
  develop(sceneId, development) {
    this.developments.push({
      sceneId,
      development,
      timestamp: Date.now()
    });
    
    this.metadata.lastMention = Date.now();
    this.metadata.scenesSinceMention = 0;
  }
  
  // Resolve thread
  resolve(sceneId, resolution) {
    this.status = 'resolved';
    this.payoff = {
      sceneId,
      resolution,
      timestamp: Date.now()
    };
  }
  
  // Check if thread should resurface
  shouldResurface() {
    // Don't resurface if recently mentioned
    if (this.metadata.scenesSinceMention < 3) return false;
    
    // Higher priority threads resurface more often
    const probability = this.priority / 10 * 0.3;
    
    return Math.random() < probability;
  }
  
  // Increment scenes since mention
  tick() {
    this.metadata.scenesSinceMention++;
  }
}

class ThreadManager {
  constructor() {
    this.threads = new Map();
  }
  
  createThread(id, type, priority, seed) {
    const thread = new NarrativeThread(id, type, priority);
    thread.seeds.push(seed);
    this.threads.set(id, thread);
    return thread;
  }
  
  developThread(threadId, sceneId, development) {
    const thread = this.threads.get(threadId);
    if (thread) {
      thread.develop(sceneId, development);
    }
  }
  
  getActiveThreads() {
    return Array.from(this.threads.values())
      .filter(t => t.status === 'active');
  }
  
  getPayoffCandidates() {
    return Array.from(this.threads.values())
      .filter(t => 
        t.status === 'active' && 
        t.developments.length >= 2 &&
        t.metadata.scenesSinceMention >= 5
      )
      .sort((a, b) => b.priority - a.priority);
  }
  
  tickAll() {
    this.threads.forEach(thread => thread.tick());
  }
}
```

---

## 📈 EXAMPLE: THREAD LIFECYCLE

```javascript
// EPISODE 1, Scene 2: Thread is seeded
const mysteryThread = threadManager.createThread(
  'chen_secret_research',
  'mystery',
  8,  // High priority
  {
    sceneId: 'medical_crisis_1',
    hint: 'Dr. Chen seems distracted, worried about something beyond the immediate crisis'
  }
);

// EPISODE 1, Scene 5: Thread develops
threadManager.developThread(
  'chen_secret_research',
  'supply_inventory',
  {
    clue: 'Medical supplies are missing, but the logs show they should be there',
    playerAwareness: 30  // Players might notice this
  }
);

// EPISODE 2, Scene 3: Thread develops more
threadManager.developThread(
  'chen_secret_research',
  'late_night_discovery',
  {
    clue: 'Caught Dr. Chen in the restricted lab at 3 AM',
    playerAwareness: 60  // This is pretty obvious
  }
);

// EPISODE 3, Scene 7: Thread pays off
const payoffScene = scenePool.payoffs.find(s => 
  s.payoffFor.includes('chen_secret_research')
);

// The narrative director gives this scene high priority
// because it resolves a long-running thread
```

---

## 🎯 PUTTING IT TOGETHER: SCENE SELECTION ALGORITHM

```javascript
async function selectAndEnhanceScene(context) {
  // 1. Get all eligible scenes
  const eligible = scenePool.all.filter(scene => 
    meetsRequirements(scene, context.worldState, context.playerProfile)
  );
  
  // 2. Check for thread payoffs (high priority)
  const threadPayoffs = eligible.filter(scene => {
    const activeThreads = threadManager.getActiveThreads();
    return scene.payoffFor && scene.payoffFor.some(threadId =>
      activeThreads.find(t => t.id === threadId)
    );
  });
  
  if (threadPayoffs.length > 0 && Math.random() < 0.6) {
    // 60% chance to prioritize payoffs
    return await enhanceScene(threadPayoffs[0], context);
  }
  
  // 3. Check for emergent events (override normal flow)
  const emergentEvents = context.worldState.checkEmergentEvents();
  if (emergentEvents.length > 0 && Math.random() < 0.7) {
    const emergentScene = createEmergentScene(emergentEvents[0], eligible);
    return await enhanceScene(emergentScene, context);
  }
  
  // 4. Score remaining scenes
  const scored = eligible.map(scene => ({
    scene,
    score: scoreScene(scene, context)
  }));
  
  // 5. Add randomness
  scored.forEach(s => {
    s.score *= (0.7 + Math.random() * 0.6);  // ±30% variance
  });
  
  // 6. Pick winner and enhance
  const winner = scored.sort((a, b) => b.score - a.score)[0];
  
  return await enhanceScene(winner.scene, context);
}

async function enhanceScene(baseScene, context) {
  // If scene is marked for AI enhancement
  if (baseScene.aiEnhancement?.required || Math.random() < 0.4) {
    return await aiGenerator.enhanceScene(
      baseScene,
      context.worldState,
      context.playerProfile,
      context
    );
  }
  
  // Otherwise use base scene with variable substitution
  return substituteVariables(baseScene, context);
}
```

This scene pool architecture enables true self-evolution. Every scene can adapt to world state, player personality, and narrative history. Want to see a complete working example with multiple sessions?
