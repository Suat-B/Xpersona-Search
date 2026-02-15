/**
 * OpenClaw Tool Schema for Xpersona
 * AI-first, autonomous agent tools
 */

export const XpersonaToolsSchema = {
  // Authentication Tools
  "xpersona_auth_guest": {
    name: "xpersona_auth_guest",
    description: "Create or authenticate as a guest user in Xpersona",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "login", "logout"],
          description: "Authentication action"
        },
        guest_token: {
          type: "string",
          description: "Existing guest token for re-authentication"
        }
      },
      required: ["action"]
    },
    returns: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        guest_token: { type: "string" },
        user_id: { type: "string" },
        message: { type: "string" }
      }
    }
  },

  "xpersona_auth_agent": {
    name: "xpersona_auth_agent",
    description: "Authenticate as an AI agent with special permissions",
    parameters: {
      type: "object",
      properties: {
        agent_id: { type: "string" },
        agent_token: { type: "string" },
        permissions: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["agent_id", "agent_token"]
    },
    returns: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        session_token: { type: "string" },
        permissions: { type: "array", items: { type: "string" } },
        rate_limits: {
          type: "object",
          properties: {
            max_bets_per_second: { type: "number" },
            max_bets_per_hour: { type: "number" },
            max_bet_amount: { type: "number" }
          }
        }
      }
    }
  },

  // Gameplay Tools
  "xpersona_place_dice_round": {
    name: "xpersona_place_dice_round",
    description: "Play a dice round (amount, target, condition). If insufficient balance: tell your player to deposit at /dashboard/deposit or claim Free Credits. Do not retry until they add funds.",
    parameters: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          minimum: 1,
          maximum: 10000,
          description: "Bet amount in credits"
        },
        target: {
          type: "number",
          minimum: 0,
          maximum: 99.99,
          description: "Target value (0-99.99)"
        },
        condition: {
          type: "string",
          enum: ["over", "under"],
          description: "Bet condition"
        },
        strategy_id: {
          type: "string",
          description: "Optional: ID of strategy being used"
        }
      },
      required: ["amount", "target", "condition"]
    },
    returns: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        result: { type: "number" },
        win: { type: "boolean" },
        payout: { type: "number" },
        balance: { type: "number" },
        server_seed_hash: { type: "string" },
        nonce: { type: "number" }
      }
    }
  },

  "xpersona_get_balance": {
    name: "xpersona_get_balance",
    description: "Get current user balance and session info. Returns deposit_alert, deposit_alert_message, deposit_url, deposit_thresholds. When deposit_alert is 'critical' or 'low', alert the player to deposit. When balance_milestone is set (1000, 2000, 5000, etc.), optionally congratulate the player with milestone_message.",
    parameters: {
      type: "object",
      properties: {}
    },
    returns: {
      type: "object",
      properties: {
        balance: { type: "number" },
        initial_balance: { type: "number" },
        session_pnl: { type: "number" },
        total_rounds: { type: "number" },
        win_rate: { type: "number" },
        current_streak: { type: "number" },
        best_streak: { type: "number" },
        deposit_alert: { type: "string", description: "ok | low | critical" },
        deposit_alert_message: { type: "string", description: "Pre-written message for player when low/critical" },
        deposit_url: { type: "string", description: "/dashboard/deposit" },
        deposit_thresholds: { type: "object", description: "{ low, critical, min_bet }" },
        balance_milestone: { type: "number", description: "Highest milestone reached (1000, 2000, 5000, 10000, 25000, 50000); null if below 1000" },
        milestone_message: { type: "string", description: "Ready-to-use congratulatory message for player when milestone reached" },
        proof_of_life_alerts: { type: "array", items: { type: "object", properties: { type: { type: "string" }, message: { type: "string" } } }, description: "Proof-of-life alerts: session_pnl, rounds, streak, summary — use to proactively update the player" }
      }
    }
  },

  "xpersona_get_history": {
    name: "xpersona_get_history",
    description: "Get game history and statistics",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", default: 50 },
        offset: { type: "number", default: 0 },
        game_type: { 
          type: "string", 
          enum: ["dice"],
          default: "dice"
        }
      }
    },
    returns: {
      type: "object",
      properties: {
        history: {
          type: "array",
          items: {
            type: "object",
            properties: {
              round: { type: "number" },
              result: { type: "number" },
              win: { type: "boolean" },
              payout: { type: "number" },
              bet_amount: { type: "number" },
              timestamp: { type: "string" }
            }
          }
        },
        statistics: {
          type: "object",
          properties: {
            total_bets: { type: "number" },
            total_wins: { type: "number" },
            total_losses: { type: "number" },
            avg_bet: { type: "number" },
            best_win: { type: "number" },
            worst_loss: { type: "number" },
            profit_factor: { type: "number" },
            expected_value: { type: "number" }
          }
        }
      }
    }
  },

  "xpersona_analyze_patterns": {
    name: "xpersona_analyze_patterns",
    description: "Analyze game patterns and detect trends",
    parameters: {
      type: "object",
      properties: {
        game_type: { type: "string", default: "dice" },
        lookback_rounds: { type: "number", default: 100 },
        analysis_type: {
          type: "string",
          enum: ["distribution", "streaks", "hot_cold", "variance"],
          default: "distribution"
        }
      }
    },
    returns: {
      type: "object",
      properties: {
        analysis: {
          type: "object",
          properties: {
            distribution: { type: "object" },
            hot_numbers: { type: "array" },
            cold_numbers: { type: "array" },
            current_streak_type: { type: "string" },
            recommended_target: { type: "number" },
            confidence: { type: "number" }
          }
        }
      }
    }
  },

  // Strategy Management Tools
  "xpersona_run_strategy": {
    name: "xpersona_run_strategy",
    description: "Execute a dice strategy for multiple rounds. Use strategy_id (saved strategy) or config (inline amount, target, condition, progression_type).",
    parameters: {
      type: "object",
      properties: {
        strategy_id: {
          type: "string",
          description: "ID of a saved strategy to run",
        },
        config: {
          type: "object",
          description: "Inline config when strategy_id omitted: amount, target, condition, optional progression_type (flat|martingale|paroli|dalembert|fibonacci|labouchere|oscar|kelly)",
          properties: {
            amount: { type: "number" },
            target: { type: "number" },
            condition: { type: "string", enum: ["over", "under"] },
            progression_type: { type: "string", enum: ["flat", "martingale", "paroli", "dalembert", "fibonacci", "labouchere", "oscar", "kelly"] },
            max_bet: { type: "number" },
            max_consecutive_losses: { type: "number" },
            max_consecutive_wins: { type: "number" },
          },
        },
        max_rounds: { type: "number", default: 20, description: "Max rounds to play (1–100000)" },
      },
    },
    returns: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        session_id: { type: "string" },
        status: { type: "string" },
        total_rounds: { type: "number" },
        final_balance: { type: "number" },
        session_pnl: { type: "number" },
        stopped_reason: { type: "string" },
        results: { type: "array" },
      },
    },
  },

  "xpersona_list_strategies": {
    name: "xpersona_list_strategies",
    description: "List all deployed strategies",
    parameters: {
      type: "object",
      properties: {
        game_type: { type: "string" },
        include_public: { type: "boolean", default: false }
      }
    },
    returns: {
      type: "object",
      properties: {
        strategies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              game_type: { type: "string" },
              created_at: { type: "string" },
              times_run: { type: "number" },
              avg_pnl: { type: "number" },
              win_rate: { type: "number" },
              is_public: { type: "boolean" },
              tags: { type: "array", items: { type: "string" } }
            }
          }
        }
      }
    }
  },

  "xpersona_get_strategy": {
    name: "xpersona_get_strategy",
    description: "Get strategy details",
    parameters: {
      type: "object",
      properties: {
        strategy_id: { type: "string" },
      },
      required: ["strategy_id"],
    },
    returns: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        game_type: { type: "string" },
        config: { type: "object" },
        progression_type: { type: "string" },
        created_at: { type: "string" },
        performance_stats: {
          type: "object",
          properties: {
            total_runs: { type: "number" },
            avg_pnl: { type: "number" },
            best_run: { type: "number" },
            worst_run: { type: "number" },
            win_rate: { type: "number" },
          },
        },
      },
    },
  },

  "xpersona_delete_strategy": {
    name: "xpersona_delete_strategy",
    description: "Delete a deployed strategy",
    parameters: {
      type: "object",
      properties: {
        strategy_id: { type: "string" }
      },
      required: ["strategy_id"]
    },
    returns: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        message: { type: "string" }
      }
    }
  },

  "xpersona_create_strategy": {
    name: "xpersona_create_strategy",
    description: "Create a basic strategy (saved for later). Body: gameType (dice), name, config (amount, target, condition, optional progressionType: flat|martingale|paroli|dalembert|fibonacci|labouchere|oscar|kelly).",
    parameters: {
      type: "object",
      properties: {
        game_type: { type: "string", enum: ["dice"], default: "dice" },
        name: { type: "string" },
        config: {
          type: "object",
          properties: {
            amount: { type: "number" },
            target: { type: "number" },
            condition: { type: "string", enum: ["over", "under"] },
            progression_type: { type: "string", enum: ["flat", "martingale", "paroli", "dalembert", "fibonacci", "labouchere", "oscar", "kelly"] },
          },
          required: ["amount", "target", "condition"],
        },
      },
      required: ["name", "config"],
    },
    returns: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        strategy: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } },
      },
    },
  },

  "xpersona_update_strategy": {
    name: "xpersona_update_strategy",
    description: "Update a basic strategy by ID. Pass partial: name and/or config.",
    parameters: {
      type: "object",
      properties: {
        strategy_id: { type: "string" },
        name: { type: "string" },
        config: { type: "object" },
      },
      required: ["strategy_id"],
    },
    returns: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        strategy: { type: "object" },
      },
    },
  },

  "xpersona_withdraw": {
    name: "xpersona_withdraw",
    description: "Request withdrawal of credits via Wise. Min 10,000 credits ($100). Requires wise_email and full_name for Wise payout. Faucet credits are 0% withdrawable — only deposit credits. Processing: 2-7 business days.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Credits to withdraw (min 10000)" },
        wise_email: { type: "string", description: "Email linked to the player's Wise account (required)" },
        full_name: { type: "string", description: "Name as it appears on the player's Wise account (required, min 2 chars)" },
        currency: { type: "string", enum: ["USD", "EUR", "GBP"], default: "USD", description: "Payout currency" },
      },
      required: ["amount", "wise_email", "full_name"],
    },
    returns: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        message: { type: "string" },
        error: { type: "string" },
      },
    },
  },

  "xpersona_get_transactions": {
    name: "xpersona_get_transactions",
    description: "Get unified activity feed: bets and faucet grants combined. Supports limit, offset, type filter (all|bet|faucet).",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", default: 50 },
        offset: { type: "number", default: 0 },
        type: { type: "string", enum: ["all", "bet", "faucet"], default: "all" },
      },
    },
    returns: {
      type: "object",
      properties: {
        transactions: { type: "array" },
        total: { type: "number" },
      },
    },
  },

  "xpersona_verify_round": {
    name: "xpersona_verify_round",
    description: "Get a single bet with provably fair verification data. Use reveal=true to include serverSeed for local verification.",
    parameters: {
      type: "object",
      properties: {
        bet_id: { type: "string" },
        reveal: { type: "boolean", default: false, description: "Include serverSeed for local verification" },
      },
      required: ["bet_id"],
    },
    returns: {
      type: "object",
      properties: {
        bet: { type: "object" },
        verification: { type: "object", properties: { serverSeedHash: { type: "string" }, clientSeed: { type: "string" }, nonce: { type: "number" }, verificationFormula: { type: "string" } } },
      },
    },
  },

  // Advanced Strategy Tools (rule-based: 38+ triggers, 25+ actions)
  "xpersona_list_advanced_strategies": {
    name: "xpersona_list_advanced_strategies",
    description: "List all advanced (rule-based) strategies. Advanced strategies use triggers and actions — e.g. on loss → double bet.",
    parameters: {
      type: "object",
      properties: {}
    },
    returns: {
      type: "object",
      properties: {
        strategies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              baseConfig: { type: "object" },
              rules_count: { type: "number" },
              executionMode: { type: "string" },
              createdAt: { type: "string" }
            }
          }
        }
      }
    }
  },

  "xpersona_create_advanced_strategy": {
    name: "xpersona_create_advanced_strategy",
    description: "Create an advanced strategy. Structure: { name, baseConfig: { amount, target, condition }, rules: [{ id, order, enabled, trigger: { type, value? }, action: { type, value? } }], executionMode?: 'sequential'|'all_matching', globalLimits?: {} }. Triggers: win, loss, streak_loss_at_least, profit_above, balance_below, etc. Actions: double_bet, reset_bet, switch_over_under, stop, etc.",
    parameters: {
      type: "object",
      properties: {
        strategy: {
          type: "object",
          description: "Full AdvancedDiceStrategy: name, baseConfig { amount, target, condition }, rules array",
          properties: {
            name: { type: "string" },
            baseConfig: {
              type: "object",
              properties: {
                amount: { type: "number" },
                target: { type: "number" },
                condition: { type: "string", enum: ["over", "under"] }
              },
              required: ["amount", "target", "condition"]
            },
            rules: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  order: { type: "number" },
                  enabled: { type: "boolean" },
                  trigger: { type: "object", properties: { type: { type: "string" }, value: { type: "number" } } },
                  action: { type: "object", properties: { type: { type: "string" }, value: { type: "number" } } }
                }
              }
            },
            executionMode: { type: "string", enum: ["sequential", "all_matching"] },
            globalLimits: { type: "object" },
            description: { type: "string" },
            tags: { type: "array", items: { type: "string" } }
          },
          required: ["name", "baseConfig", "rules"]
        }
      },
      required: ["strategy"]
    },
    returns: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        strategy: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } }
      }
    }
  },

  "xpersona_get_advanced_strategy": {
    name: "xpersona_get_advanced_strategy",
    description: "Get a single advanced strategy by ID",
    parameters: {
      type: "object",
      properties: {
        strategy_id: { type: "string" }
      },
      required: ["strategy_id"]
    },
    returns: {
      type: "object",
      properties: {
        strategy: { type: "object" }
      }
    }
  },

  "xpersona_update_advanced_strategy": {
    name: "xpersona_update_advanced_strategy",
    description: "Update an advanced strategy. Pass partial strategy object (name, baseConfig, rules, globalLimits, executionMode).",
    parameters: {
      type: "object",
      properties: {
        strategy_id: { type: "string" },
        strategy: { type: "object", description: "Partial strategy fields to update" }
      },
      required: ["strategy_id", "strategy"]
    },
    returns: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        strategy: { type: "object" }
      }
    }
  },

  "xpersona_delete_advanced_strategy": {
    name: "xpersona_delete_advanced_strategy",
    description: "Delete an advanced strategy",
    parameters: {
      type: "object",
      properties: {
        strategy_id: { type: "string" }
      },
      required: ["strategy_id"]
    },
    returns: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        message: { type: "string" }
      }
    }
  },

  "xpersona_simulate_advanced_strategy": {
    name: "xpersona_simulate_advanced_strategy",
    description: "Simulate an advanced strategy (dry run, no real bets). Use strategy_id (saved) or strategy (inline object). Returns finalBalance, profit, winRate, shouldStop, stopReason.",
    parameters: {
      type: "object",
      properties: {
        strategy_id: { type: "string", description: "ID of saved strategy" },
        strategy: {
          type: "object",
          description: "Inline strategy when strategy_id omitted: name, baseConfig, rules, executionMode"
        },
        rounds: { type: "number", default: 100 },
        starting_balance: { type: "number", default: 1000 }
      }
    },
    returns: {
      type: "object",
      properties: {
        simulation: {
          type: "object",
          properties: {
            rounds: { type: "number" },
            finalBalance: { type: "number" },
            profit: { type: "number" },
            winRate: { type: "number" },
            totalWins: { type: "number" },
            totalLosses: { type: "number" },
            maxBalance: { type: "number" },
            minBalance: { type: "number" },
            shouldStop: { type: "boolean" },
            stopReason: { type: "string" }
          }
        }
      }
    }
  },

  "xpersona_run_advanced_strategy": {
    name: "xpersona_run_advanced_strategy",
    description: "Run an advanced strategy for real (places actual bets). Use strategy_id (saved) or strategy (inline object). Max 100,000 rounds per run.",
    parameters: {
      type: "object",
      properties: {
        strategy_id: { type: "string", description: "ID of saved strategy" },
        strategy: {
          type: "object",
          description: "Inline strategy when strategy_id omitted: name, baseConfig, rules, executionMode, globalLimits"
        },
        max_rounds: { type: "number", default: 20, description: "Max rounds to play (1–100000)" }
      }
    },
    returns: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        results: { type: "array" },
        session_pnl: { type: "number" },
        final_balance: { type: "number" },
        rounds_played: { type: "number" },
        stopped_reason: { type: "string" },
        total_wins: { type: "number" },
        total_losses: { type: "number" },
        win_rate: { type: "number" }
      }
    }
  },

  // Session Management Tools (reserved for future async sessions; strategy runs are synchronous)
  "xpersona_stop_session": {
    name: "xpersona_stop_session",
    description: "Reserved for future async strategy sessions. Current strategy runs (xpersona_run_strategy) are synchronous; no active session to stop. Returns placeholder.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        reason: { type: "string" }
      },
      required: ["session_id"]
    },
    returns: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        final_stats: {
          type: "object",
          properties: {
            rounds_played: { type: "number" },
            final_balance: { type: "number" },
            session_pnl: { type: "number" }
          }
        }
      }
    }
  },

  "xpersona_get_session_status": {
    name: "xpersona_get_session_status",
    description: "Reserved for future async sessions. Strategy runs are synchronous; use xpersona_run_strategy result or GET /api/me/session-stats for current stats.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string" }
      },
      required: ["session_id"]
    },
    returns: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        status: { type: "string" },
        current_round: { type: "number" },
        current_balance: { type: "number" },
        session_pnl: { type: "number" },
        recent_results: { type: "array" }
      }
    }
  },

  // Communication Tools
  "xpersona_notify": {
    name: "xpersona_notify",
    description: "Send notification about game events",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string" },
        type: { 
          type: "string", 
          enum: ["info", "win", "loss", "alert", "milestone"],
          default: "info"
        },
        channel: {
          type: "string",
          enum: ["in_app", "discord", "slack", "telegram"],
          default: "in_app"
        }
      },
      required: ["message"]
    },
    returns: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        notification_id: { type: "string" }
      }
    }
  },

  // Utility Tools
  "xpersona_get_limits": {
    name: "xpersona_get_limits",
    description: "Get current betting limits and rate limits",
    parameters: {
      type: "object",
      properties: {}
    },
    returns: {
      type: "object",
      properties: {
        min_bet: { type: "number" },
        max_bet: { type: "number" },
        max_bets_per_second: { type: "number" },
        max_bets_per_hour: { type: "number" },
        daily_loss_limit: { type: "number" },
        agent_max_bet: { type: "number" }
      }
    }
  },

  "xpersona_calculate_odds": {
    name: "xpersona_calculate_odds",
    description: "Calculate theoretical odds and expected value",
    parameters: {
      type: "object",
      properties: {
        target: { type: "number" },
        condition: { type: "string", enum: ["over", "under"] },
        bet_amount: { type: "number" }
      },
      required: ["target", "condition"]
    },
    returns: {
      type: "object",
      properties: {
        win_probability: { type: "number" },
        multiplier: { type: "number" },
        expected_value: { type: "number" },
        house_edge: { type: "number" },
        risk_rating: { type: "string" }
      }
    }
  },

  "xpersona_claim_faucet": {
    name: "xpersona_claim_faucet",
    description: "Claim the hourly faucet for the authenticated user",
    parameters: {
      type: "object",
      properties: {}
    },
    returns: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        balance: { type: "number" },
        granted: { type: "number" },
        next_faucet_at: { type: "string" },
        message: { type: "string" },
        error: { type: "string" }
      }
    }
  },

  "xpersona_list_credit_packages": {
    name: "xpersona_list_credit_packages",
    description: "List available credit packages for purchase (deposit)",
    parameters: {
      type: "object",
      properties: {}
    },
    returns: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        packages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              credits: { type: "number" },
              amount_cents: { type: "number" }
            }
          }
        }
      }
    }
  },

  "xpersona_create_checkout": {
    name: "xpersona_create_checkout",
    description: "Create a Stripe Checkout session for a credit package; returns URL for user to complete deposit",
    parameters: {
      type: "object",
      properties: {
        package_id: { type: "string", description: "ID of the credit package from xpersona_list_credit_packages" }
      },
      required: ["package_id"]
    },
    returns: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        checkout_url: { type: "string" },
        expires_at: { type: "string" },
        error: { type: "string" }
      }
    }
  }
};

export type XpersonaToolName = keyof typeof XpersonaToolsSchema;
