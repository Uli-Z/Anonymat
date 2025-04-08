"use strict";

// Helper function for comparison
function compareResults(test, anonymizedOutput, deanonymizedOutput) {
  const errors = [];

  // Check anonymization result
  if (anonymizedOutput !== test.expectedAnonymized) {
    errors.push({
      description: test.description + " - Anonymization mismatch",
      input: test.input,
      expected_anonymized: test.expectedAnonymized,
      anonymize_output: anonymizedOutput,
      deanonymize_output: deanonymizedOutput
    });
  }

  // Check deanonymization (should restore original input)
  if (deanonymizedOutput !== test.input) {
    errors.push({
      description: test.description + " - Deanonymization mismatch",
      input: test.input,
      expected_anonymized: test.expectedAnonymized,
      anonymize_output: anonymizedOutput,
      deanonymize_output: deanonymizedOutput
    });
  }

  return errors;
}

// New test cases for NumberPlaceholder, NamePlaceholder, and EmailPlaceholder
const tests = [
  {
    description: "Too short number (2 digits) should not be detected",
    input: "12",
    expectedAnonymized: "12"
  },
  {
    description: "Minimum valid number (3 digits)",
    input: "123",
    expectedAnonymized: "[Number]"
  },
  {
    description: "Number with hyphen",
    input: "12341324-132424",
    expectedAnonymized: "[Number]"
  },
  {
    description: "Number with dots",
    input: "1234.32411.1234",
    expectedAnonymized: "[Number]"
  },
  {
    description: "Number with slashes",
    input: "1324/21342/213123",
    expectedAnonymized: "[Number]"
  },
  {
    description: "Composite numbers test",
    input: "Order 12, then 123, then 12341324-132424, 1234.32411.1234 and 1324/21342/213123.",
    expectedAnonymized: "Order 12, then [Number_4], then [Number_2], [Number_3] and [Number]."
  },
  {
    description: "Name with prefix detection",
    input: "Hallo John",
    expectedAnonymized: "Hallo [Name]"
  },
  {
    description: "Composite name test with full name",
    input: "Guten Tag Maria Müller, wie geht es?",
    expectedAnonymized: "Guten Tag [Name], wie geht es?"
  },
  {
    description: "Name without prefix should not be detected",
    input: "John",
    expectedAnonymized: "John"
  },
  {
    description: "Composite test with number and name",
    input: "Order 123 and Hallo John and Guten Tag Maria Müller",
    expectedAnonymized: "Order [Number] and Hallo [Name_2] and Guten Tag [Name]"
  },
  {
    description: "Simple email detection",
    input: "user@example.com",
    expectedAnonymized: "[Email]"
  },
  {
    description: "Composite email test",
    input: "Contact: user@example.com for info.",
    expectedAnonymized: "Contact: [Email] for info."
  },
  {
    description: "Multiple email detection",
    input: "Emails: user@example.com, admin@example.org.",
    expectedAnonymized: "Emails: [Email_2], [Email]."
  },
  {
    description: "False positive email should not be detected",
    input: "Not an email: user_at_example.com",
    expectedAnonymized: "Not an email: user_at_example.com"
  }
];

async function runTests() {
  let allPassed = true;
  const errors = [];

  for (const test of tests) {
    console.log("Running test: " + test.description);
    const anonymizer = new window.Anonymizer();
    anonymizer.setText(test.input);

    // Wait until anonymization is finished:
    await anonymizer.anonymize();

    const anonymizedOutput = anonymizer.getText();
    const deanonymizedOutput = anonymizer.deanonymize();

    const testErrors = compareResults(test, anonymizedOutput, deanonymizedOutput);
    if (testErrors.length > 0) {
      allPassed = false;
      testErrors.forEach(e => {
        console.error(`Test failed: ${e.description}`);
        console.error(`  Input               : ${e.input}`);
        console.error(`  Expected anonymized : ${e.expected_anonymized}`);
        console.error(`  Anonymize output    : ${e.anonymize_output}`);
        console.error(`  Deanonymize output  : ${e.deanonymize_output}`);
      });
      errors.push(...testErrors);
    } else {
      console.log(`Test passed: ${test.description}`);
    }
  }

  if (allPassed) {
    console.log("All tests passed successfully.");
  } else {
    console.error("Some tests failed. See error details.");
  }

  window.testResults = {
    success: allPassed,
    errors: errors
  };
}

(async () => { await runTests(); })();
