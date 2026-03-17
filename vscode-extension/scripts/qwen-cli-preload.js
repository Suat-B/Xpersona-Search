#!/usr/bin/env node
"use strict";
/** Replaces argv[1] before CLI loads to avoid leaking extension path into model context. */
process.argv[1] = "qwen-cli";
