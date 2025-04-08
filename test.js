"use strict";

// =============================================
// Base class for all Test Cases
// =============================================
class TestCase {
  constructor({ description, input, expectedOutput }) {
    this.description = description;
    this.input = input;
    this.expectedOutput = expectedOutput;
  }

  // This method must be implemented by the subclasses.
  async run() {
    throw new Error("run() must be implemented in the subclass");
  }
}

// =============================================
// TestCase for simple input/output comparisons
// =============================================
class SimpleIOTestCase extends TestCase {
  async run() {
    const anonymizer = new window.Anonymizer();
    anonymizer.setText(this.input);

    // Wait for anonymization to complete
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

    return {
      description: this.description,
      passed: errors.length === 0,
      errors: errors
    };
  }
}

// =============================================
// TestCase specifically for Custom Placeholders
// =============================================
class CustomPlaceholderTestCase extends TestCase {
  constructor({ description, input, expectedOutput, customPlaceholder }) {
    super({ description, input, expectedOutput });
    this.customPlaceholder = customPlaceholder;
  }

  async run() {
    const anonymizer = new window.Anonymizer();
    anonymizer.setText(this.input);

    // Register the custom placeholder if defined
    if (this.customPlaceholder) {
      anonymizer.addCustomPlaceholder(
        this.customPlaceholder.label,
        this.customPlaceholder.pattern
      );
    }

    // Wait for anonymization to complete
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

    return {
      description: this.description,
      passed: errors.length === 0,
      errors: errors
    };
  }
}

// =============================================
// Test Runner: Execute all test cases
// =============================================
async function runAllTests() {
  // List of all test cases: existing simple I/O tests and custom placeholder tests.
  const testCases = [
    // --- Simple I/O Test Cases (based on previous tests) ---
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
      description: "Name with prefix detection",
      input: "Hallo John",
      expectedOutput: "Hallo [Name]"
    }),
    new SimpleIOTestCase({
      description: "Composite name test with full name",
      input: "Guten Tag Maria Müller, wie geht es?",
      expectedOutput: "Guten Tag [Name], wie geht es?"
    }),
    new SimpleIOTestCase({
      description: "Name without prefix should not be detected",
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
    // --- Custom Placeholder Test Cases ---
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
      customPlaceholder: { label: "Custom", pattern: "/FOO(\\d)/" }
    })
    // Additional test types can be added here.
  ];

  let allPassed = true;
  for (const testCase of testCases) {
    try {
      const result = await testCase.run();
      if (result.passed) {
        console.log(`Test passed: ${result.description}`);
      } else {
        console.error(`Test failed: ${result.description}`);
        result.errors.forEach(e => console.error(e));
        allPassed = false;
      }
    } catch (err) {
      console.error(`Error in test "${testCase.description}": ${err.message}`);
      allPassed = false;
    }
  }

  console.log(allPassed ? "All tests passed successfully." : "At least one test failed.");
}

// =============================================
// Run the tests
// =============================================
(async () => {
  await runAllTests();
})();
