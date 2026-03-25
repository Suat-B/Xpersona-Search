// Entry point of the TypeScript service
import { greet } from './greet';

// Export callable function
export const runService = () => {
  console.log(greet('love'));
};