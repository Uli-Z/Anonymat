/**
 * config.js
 * Manages application configuration and cookie storage.
 */
(function (window) {
    // Set a cookie with a specified name, value, and expiration (in days)
    function setCookie(name, value, days) {
      var expires = "";
      if (days) {
        var date = new Date();
        date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
        expires = "; expires=" + date.toUTCString();
      }
      document.cookie = name + "=" + (value || "") + expires + "; path=/";
    }
  
    // Retrieve a cookie value by name
    function getCookie(name) {
      var nameEQ = name + "=";
      var ca = document.cookie.split(";");
      for (var i = 0; i < ca.length; i++) {
        var c = ca[i].trim();
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length);
      }
      return null;
    }
  
    // Load configuration from a cookie, or return default config on error or if not found
    function loadConfig() {
      var cookieConfig = getCookie("AppConfig");
      if (cookieConfig) {
        try {
          return JSON.parse(cookieConfig);
        } catch (e) {
          console.error("Error parsing AppConfig cookie", e);
        }
      }
      return {
        language: "de"
      };
    }
  
    // Save the configuration object to a cookie
    function saveConfig(config) {
      setCookie("AppConfig", JSON.stringify(config), 30);
    }
  
    // Global configuration object with getter, setter, and updater methods
    window.Config = {
      config: loadConfig(),
  
      // Get a configuration value by key
      get: function (key) {
        return this.config[key];
      },
  
      // Set a configuration value and persist the change
      set: function (key, value) {
        this.config[key] = value;
        saveConfig(this.config);
      },
  
      // Update multiple configuration values and persist changes
      update: function (newConfig) {
        for (var key in newConfig) {
          if (newConfig.hasOwnProperty(key)) {
            this.config[key] = newConfig[key];
          }
        }
        saveConfig(this.config);
      }
    };
  
    // Expose cookie helper functions for debugging or advanced use
    window.Config._setCookie = setCookie;
    window.Config._getCookie = getCookie;
  })(window);
  