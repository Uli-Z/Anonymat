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

// New test cases for NumberPlaceholder and NamePlaceholder
const tests = [
  {
    description: "Simple number test",
    input: "12345",
    expectedAnonymized: "[Number]"
  },
  {
    description: "Embedded number test",
    input: "Order 12345 confirmed",
    expectedAnonymized: "Order [Number] confirmed"
  },
  {
    description: "Simple name test",
    input: "Hallo John",
    expectedAnonymized: "Hallo [Name]"
  },
  {
    description: "Composite name test",
    input: "Guten Tag Maria Müller, wie geht es dir?",
    expectedAnonymized: "Guten Tag [Name], wie geht es dir?"
  },
  {
    description: "Composite test with number and name",
    input: "Rechnung 98765: Hallo Anna",
    expectedAnonymized: "Rechnung [Number]: Hallo [Name]"
  }
];

async function runTests() {
  let allPassed = true;
  const errors = [];

  for (const test of tests) {
    console.log("Running test: " + test.description);
    const anonymizer = new window.Anonymizer();
    anonymizer.setText(test.input);

    // Wait until anonymization is finished
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
