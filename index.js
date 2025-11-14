import { WineJS } from './src/runtime/wine-js.js';
import { setupWineRuntime, bootWineRuntime } from './src/runtime/bootstrap.js';

bootWineRuntime();

if (typeof window !== 'undefined') {
  window.WineJS = WineJS;
}

const runtime = { WineJS, setupWineRuntime };

export { WineJS, setupWineRuntime, bootWineRuntime };
export default runtime;
