import { createRoot } from 'react-dom/client';
import { AppRegistry } from 'react-native';
import App from '../src/App';

/**
 * Web entry for the browser journeys (002/T101).
 *
 * This mounts THE SAME screens the device build mounts, through the same
 * containers and the same data layer. It exists because the UI had never
 * rendered against a live server: the data layer is covered by 22 HTTP journeys
 * and the components by 31 render tests, and the two had never run together.
 *
 * It is NOT a device test. Permissions, camera, photo library, backgrounding and
 * real network conditions do not exist here - see T045.
 */
AppRegistry.registerComponent('socialInterest', () => App);
const root = createRoot(document.getElementById('root')!);
root.render(<App />);
