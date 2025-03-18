/**
 * utils.js
 * General utility functions for string manipulation, DOM element creation, and throttling.
 */
(function (window) {
  "use strict";

  // Escape HTML special characters to prevent XSS issues.
  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Escape special characters in a string for use in a regular expression.
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Create a button element with a given label and click callback.
  function createButton(label, callback, className) {
    var btn = document.createElement("button");
    btn.textContent = label;
    if (className) {
      btn.classList.add(className);
    }
    btn.addEventListener("click", callback);
    return btn;
  }

  // Throttle the execution of a function by the specified delay (in ms).
  function throttle(callback, delay) {
    var lastCall = 0;
    var timeoutId = null;
    var lastArgs = null;

    function throttled() {
      lastArgs = arguments;
      var now = Date.now();
      var remaining = delay - (now - lastCall);
      if (remaining <= 0) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        lastCall = now;
        callback.apply(null, lastArgs);
      } else if (!timeoutId) {
        timeoutId = setTimeout(function () {
          lastCall = Date.now();
          timeoutId = null;
          callback.apply(null, lastArgs);
        }, remaining);
      }
    }

    throttled.flush = function () {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
        lastCall = Date.now();
        callback.apply(null, lastArgs);
      }
    };

    return throttled;
  }

  // Get all match intervals for a search string within a given text.
  function getMatchIntervals(text, searchString, className) {
    var intervals = [];
    var start = 0;
    while (true) {
      var index = text.indexOf(searchString, start);
      if (index === -1) break;
      intervals.push({ start: index, end: index + searchString.length, className: className });
      start = index + 1;
    }
    return intervals;
  }

  // Merge overlapping intervals.
  function mergeOverlappingIntervals(intervals) {
    if (!intervals.length) return [];
    intervals.sort(function (a, b) {
      return a.start - b.start;
    });
    var merged = [intervals[0]];
    for (var i = 1; i < intervals.length; i++) {
      var last = merged[merged.length - 1];
      if (intervals[i].start <= last.end) {
        last.end = Math.max(last.end, intervals[i].end);
      } else {
        merged.push(intervals[i]);
      }
    }
    return merged;
  }

  // Collect match intervals for an array of search strings.
  function collectIntervals(text, matches, className) {
    return matches.reduce(function (acc, match) {
      return acc.concat(getMatchIntervals(text, match, className));
    }, []);
  }

  // Expose utility functions under the global 'Utils' namespace.
  window.Utils = {
    escapeHtml: escapeHtml,
    escapeRegExp: escapeRegExp,
    createButton: createButton,
    throttle: throttle,
    getMatchIntervals: getMatchIntervals,
    mergeOverlappingIntervals: mergeOverlappingIntervals,
    collectIntervals: collectIntervals
  };
})(window);
