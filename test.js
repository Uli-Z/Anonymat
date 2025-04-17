"use strict";

// Disable first-run modal in the test build
localStorage.setItem("firstRunAcknowledged", "true");

// Global error handler for unexpected errors
window.addEventListener("error", function (event) {
  console.error("Global error caught:", event.error);
  window.testResults = {
    success: false,
    errors: [{
      description: "Global error",
      errors: [event.error ? event.error.toString() : event.message]
    }]
  };
  window.testStatus = "failed";
});

// =============================================
// Base class for all test cases
// =============================================
class TestCase {
  constructor({ description, input, expectedOutput }) {
    this.description = description;
    this.input = input;
    this.expectedOutput = expectedOutput;
  }

  async run() {
    throw new Error("run() must be implemented in subclass");
  }
}

// =============================================
// Simple I/O Test Case
// =============================================
class SimpleIOTestCase extends TestCase {
  async run() {
    const anonymizer = new window.Anonymizer();
    anonymizer.setText(this.input);
    await anonymizer.anonymize();
    const anonymizedOutput = anonymizer.getText();
    const deanonymizedOutput = anonymizer.deanonymize();

    let errors = [];
    if (anonymizedOutput !== this.expectedOutput) {
      errors.push(`Anonymize: expected "${this.expectedOutput}", but got "${anonymizedOutput}"`);
    }
    if (deanonymizedOutput !== this.input) {
      errors.push(`Deanonymize: expected "${this.input}", but got "${deanonymizedOutput}"`);
    }

    return { description: this.description, passed: errors.length === 0, errors };
  }
}

// =============================================
// Custom Placeholder Test Case
// =============================================
class CustomPlaceholderTestCase extends TestCase {
  constructor(opts) {
    super(opts);
    this.customPlaceholder = opts.customPlaceholder;
  }

  async run() {
    const anonymizer = new window.Anonymizer();
    anonymizer.setText(this.input);
    if (this.customPlaceholder) {
      anonymizer.addCustomPlaceholder(
        this.customPlaceholder.label,
        this.customPlaceholder.pattern
      );
    }
    await anonymizer.anonymize();
    const anonymizedOutput = anonymizer.getText();
    const deanonymizedOutput = anonymizer.deanonymize();

    let errors = [];
    if (anonymizedOutput !== this.expectedOutput) {
      errors.push(`Anonymize: expected "${this.expectedOutput}", but got "${anonymizedOutput}"`);
    }
    if (deanonymizedOutput !== this.input) {
      errors.push(`Deanonymize: expected "${this.input}", but got "${deanonymizedOutput}"`);
    }

    return { description: this.description, passed: errors.length === 0, errors };
  }
}

// =============================================
// List of all test cases
// =============================================
const testCases = [
  new SimpleIOTestCase({
    description: "Too short number (2 digits) should not be detected",
    input: "12",
    expectedOutput: "12"
  }),
  new SimpleIOTestCase({
    description: "Minimum valid number (3 digits)",
    input: "123",
    expectedOutput: "[Number]"
  }),
  new SimpleIOTestCase({
    description: "Number with hyphen",
    input: "12341324-132424",
    expectedOutput: "[Number]"
  }),
  new SimpleIOTestCase({
    description: "Number with dots",
    input: "1234.32411.1234",
    expectedOutput: "[Number]"
  }),
  new SimpleIOTestCase({
    description: "Number with slashes",
    input: "1324/21342/213123",
    expectedOutput: "[Number]"
  }),
  new SimpleIOTestCase({
    description: "Composite numbers test",
    input: "Order 12, then 123, then 12341324-132424, 1234.32411.1234 and 1324/21342/213123.",
    expectedOutput: "Order 12, then [Number_4], then [Number_2], [Number_3] and [Number]."
  }),
  new SimpleIOTestCase({
    description: "Name with greeting prefix detection",
    input: "Hallo John",
    expectedOutput: "Hallo [Name]"
  }),
  new SimpleIOTestCase({
    description: "Composite name test with full name",
    input: "Guten Tag Maria Müller, wie geht es?",
    expectedOutput: "Guten Tag [Name], wie geht es?"
  }),
  new SimpleIOTestCase({
    description: "Name without greeting prefix should not be detected",
    input: "John",
    expectedOutput: "John"
  }),
  new SimpleIOTestCase({
    description: "Composite test with number and name",
    input: "Order 123 and Hallo John and Guten Tag Maria Müller",
    expectedOutput: "Order [Number] and Hallo [Name_2] and Guten Tag [Name]"
  }),
  new SimpleIOTestCase({
    description: "Simple email detection",
    input: "user@example.com",
    expectedOutput: "[Email]"
  }),
  new SimpleIOTestCase({
    description: "Composite email test",
    input: "Contact: user@example.com for info.",
    expectedOutput: "Contact: [Email] for info."
  }),
  new SimpleIOTestCase({
    description: "Multiple email detection",
    input: "Emails: user@example.com, admin@example.org.",
    expectedOutput: "Emails: [Email_2], [Email]."
  }),
  new SimpleIOTestCase({
    description: "False positive email should not be detected",
    input: "Not an email: user_at_example.com",
    expectedOutput: "Not an email: user_at_example.com"
  }),
  new CustomPlaceholderTestCase({
    description: "Custom literal test",
    input: "Das ist ein CUSTOM text.",
    expectedOutput: "Das ist ein [Custom] text.",
    customPlaceholder: { label: "Custom", pattern: "CUSTOM" }
  }),
  new CustomPlaceholderTestCase({
    description: "Custom regex literal test",
    input: "FOO1 and FOO2.",
    expectedOutput: "[Custom] and [Custom_2].",
    customPlaceholder: { label: "Custom", pattern: "/FOO(\d)/" }
  })
];

// =============================================
// Test runner
// =============================================
async function runAllTests() {
  let allPassed = true;
  const errorList = [];
  for (const tc of testCases) {
    try {
      const result = await tc.run();
      if (!result.passed) {
        allPassed = false;
        errorList.push({ description: result.description, errors: result.errors });
      }
    } catch (err) {
      allPassed = false;
      errorList.push({ description: tc.description, errors: [err.message] });
    }
  }
  return { success: allPassed, errors: errorList };
}

// =============================================
// Start tests and display modal
// =============================================
(async () => {
  window.testStatus = "started";
  try {
    window.testResults = await runAllTests();
    window.testStatus = "completed";
    console.log("Tests completed.", window.testResults);
  } catch (err) {
    console.error("Tests aborted:", err);
    window.testResults = {
      success: false,
      errors: [{
        description: "Test script aborted",
        errors: [err.message || err.toString()]
      }]
    };
    window.testStatus = "failed";
  }

  function showTestResults() {
    // Open the modal
    window.Modal.showModal("testResultsModal");

    // Container for results
    const container = document.getElementById("testResultsContent");
    container.innerHTML = "";

    // Summary
    const total = testCases.length;
    const failed = window.testResults.errors.length;
    const summary = document.createElement("p");
    summary.textContent = failed > 0
      ? `${failed} of ${total} tests failed.`
      : `All ${total} tests passed successfully!`;
    container.appendChild(summary);

    // Detailed error table if there are failures
    if (failed > 0) {
      const table = document.createElement("table");
      table.style.width = "100%";
      table.style.borderCollapse = "collapse";

      const thead = document.createElement("thead");
      thead.innerHTML = `
        <tr>
          <th style="text-align:left;padding:4px">Test</th>
          <th style="text-align:left;padding:4px">Errors</th>
        </tr>`;
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      for (const err of window.testResults.errors) {
        const tr = document.createElement("tr");
        const messages = err.errors.map(e => `<li>${e}</li>`).join("");
        tr.innerHTML = `
          <td style="padding:4px;vertical-align:top">${err.description}</td>
          <td style="padding:4px"><ul style="margin:0 0 0 1em;padding:0;">${messages}</ul></td>`;
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      container.appendChild(table);
    }

    // Copy button handler
    const copyBtn = document.getElementById("copyTestErrorsBtn");
    copyBtn.onclick = () => {
      const text = JSON.stringify(window.testResults, null, 2);
      navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied!";
      setTimeout(() => copyBtn.textContent = "Copy error messages", 2000);
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showTestResults);
  } else {
    showTestResults();
  }
})();
