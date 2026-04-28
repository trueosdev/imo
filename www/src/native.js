(function () {
  function noop() {}

  if (
    typeof window.Capacitor === "undefined" ||
    typeof window.Capacitor.isNativePlatform !== "function" ||
    !window.Capacitor.isNativePlatform()
  ) {
    window.nativeHaptics = noop;
    return;
  }

  const plugins = window.Capacitor.Plugins || {};
  const StatusBar = plugins.StatusBar;
  const SplashScreen = plugins.SplashScreen;
  const Haptics = plugins.Haptics;

  function syncStatusBarStyleToTheme() {
    const theme = document.documentElement.getAttribute("data-theme");
    const style = theme === "dark" ? "LIGHT" : "DARK";
    if (StatusBar && typeof StatusBar.setStyle === "function") {
      StatusBar.setStyle({ style }).catch(noop);
    }
  }

  function hideNativeSplash() {
    if (SplashScreen && typeof SplashScreen.hide === "function") {
      SplashScreen.hide().catch(noop);
    }
  }

  window.nativeHaptics = function nativeHaptics() {
    if (Haptics && typeof Haptics.impact === "function") {
      Haptics.impact({ style: "LIGHT" }).catch(noop);
    }
  };

  syncStatusBarStyleToTheme();
  new MutationObserver(syncStatusBarStyleToTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hideNativeSplash, { once: true });
  } else {
    hideNativeSplash();
  }
})();
