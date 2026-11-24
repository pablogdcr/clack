const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

/**
 * iOS 27 refuses to launch an app that has not adopted the scene-based life cycle (it traps
 * in UIKit before any of the app's code runs). Expo ships the scene delegate for it,
 * `ExpoAppSceneDelegate`, but the project template does not use it yet. This plugin does:
 * it declares the scene in Info.plist and leaves the creation of the window, and the start
 * of React Native in it, to that delegate.
 */
module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (plist) => {
    plist.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
          },
        ],
      },
    };
    return plist;
  });

  return withAppDelegate(config, (delegate) => {
    let source = delegate.modResults.contents;
    // The scene delegate finds the React Native factory through this protocol.
    if (!source.includes('ExpoReactNativeFactoryProvider')) {
      source = source.replace(
        'class AppDelegate: ExpoAppDelegate {',
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
      );
    }
    // The window is no longer made here.
    source = source.replace(
      /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif\n/,
      '    // The window is created, and React Native started in it, by ExpoAppSceneDelegate.\n',
    );
    delegate.modResults.contents = source;
    return delegate;
  });
};
