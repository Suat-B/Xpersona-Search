/**
 * OpenClaw Tool Schema for xpersona Casino
 * AI-first, autonomous agent tools
 */

export const CasinoToolsSchema = {
  // Authentication Tools
  "casino_auth_guest": {
    name: "casino_auth_guest",
    description: "Create or authenticate as a guest user in xpersona casino",
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

  "casino_auth_agent": {
    name: "casino_auth_agent",
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
  "casino_place_dice_bet": {
    name: "casino_place_dice_bet",
    description: "Place a bet on the dice game",
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

  "casino_get_balance": {
    name: "casino_get_balance",
    description: "Get current user balance and session info",
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
        best_streak: { type: "number" }
      }
    }
  },

  "casino_get_history": {
    name: "casino_get_history",
    description: "Get game history and statistics",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", default: 50 },
        offset: { type: "number", default: 0 },
        game_type: { 
          type: "string", 
          enum: ["dice", "blackjack", "plinko", "crash", "slots"],
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

  "casino_analyze_patterns": {
    name: "casino_analyze_patterns",
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
  "casino_run_strategy": {
    name: "casino_run_strategy",
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
        max_rounds: { type: "number", default: 20, description: "Max rounds to play (1–100)" },
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

  "casino_list_strategies": {
    name: "casino_list_strategies",
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

  "casino_get_strategy": {
    name: "casino_get_strategy",
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

  "casino_delete_strategy": {
    name: "casino_delete_strategy",
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

  // Session Management Tools
  "casino_stop_session": {
    name: "casino_stop_session",
    description: "Stop an active strategy session",
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

  "casino_get_session_status": {
    name: "casino_get_session_status",
    description: "Get status of active or recent session",
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
  "casino_notify": {
    name: "casino_notify",
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
  "casino_get_limits": {
    name: "casino_get_limits",
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

  "casino_calculate_odds": {
    name: "casino_calculate_odds",
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

  "casino_claim_faucet": {
    name: "casino_claim_faucet",
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

  "casino_list_credit_packages": {
    name: "casino_list_credit_packages",
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

  "casino_create_checkout": {
    name: "casino_create_checkout",
    description: "Create a Stripe Checkout session for a credit package; returns URL for user to complete deposit",
    parameters: {
      type: "object",
      properties: {
        package_id: { type: "string", description: "ID of the credit package from casino_list_credit_packages" }
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

export type CasinoToolName = keyof typeof CasinoToolsSchema;
