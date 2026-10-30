import { getAssumptions } from './assumptions.js';
import { parseIST } from '../utils/time.js';

// "Now" for alerts and the dashboard. The Director can set a simulated time for the live demo.
export async function now() {
  const a = await getAssumptions();
  return a.simNow ? parseIST(a.simNow) : new Date();
}
