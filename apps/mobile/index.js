// Expo entry point.
//
// `main` used to point straight at src/App.tsx, which never registers a root
// component - the native shell would mount nothing and the app would show a blank
// screen on a device. Nothing caught it because the app had never been built:
// jest renders the component directly and never goes through the entry path.
import registerRootComponent from 'expo/src/launch/registerRootComponent';
import App from './src/App';

registerRootComponent(App);
