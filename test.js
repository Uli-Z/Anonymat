"use strict";

// Helper function for comparison
function compareResults(test, anonymizedOutput, deanonymizedOutput) {
  const errors = [];

  // Check anonymization
  if (anonymizedOutput !== test.expectedAnonymized) {
    errors.push({
      description: test.description + " - Anonymization mismatch",
      input: test.input,
      expected_anonymized: test.expectedAnonymized,
      anonymize_output: anonymizedOutput,
      deanonymize_output: deanonymizedOutput // also log deanonymized output for context
    });
  }

  // Check deanonymization
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

// Define test cases
const tests = [
  {
    description: "Email test",
    input: "test@example.com",
    expectedAnonymized: "[Email1]"
  },
  {
    description: "Phone test (local, no separators)",
    input: "01234567",
    expectedAnonymized: "[Phone1]"
  },
  {
    description: "Composite phone test",
    input: "01234567 +34 1234567",
    expectedAnonymized: "[Phone1] [Phone2]"
  },
  {
    description: "DateTime test (whole match replaced)",
    input: "2020-12-31 23:59:59",
    expectedAnonymized: "[Date1]"
  },
  {
    description: "URL test",
    input: "https://example.com",
    expectedAnonymized: "[URL1]"
  },
  {
    description: "IBAN test",
    input: "DE89370400440532013000",
    expectedAnonymized: "[IBAN1]"
  },
  {
    description: "CreditCard test",
    input: "4111111111111111",
    expectedAnonymized: "[CreditCard1]"
  },
  {
    description: "SSN test",
    input: "123-45-6789",
    expectedAnonymized: "[SSN1]"
  },
  {
    description: "ID test",
    input: "ABC123456",
    expectedAnonymized: "[IDNumber1]"
  },
  {
    description: "Number test",
    input: "12345",
    expectedAnonymized: "[Number1]"
  },
  {
    description: "Composite test (all types)",
    input:
      "test@example.com 01234567 +34 12345678 2020-12-31 23:59:59 https://example.com DE89370400440532013000 4111111111111111 123-45-6789 ABC123456 12345",
    expectedAnonymized:
      "[Email1] [Phone1] [Phone2] [Date1] [URL1] [IBAN1] [CreditCard1] [SSN1] [IDNumber1] [Number1]"
  },
  {
    description: "No sensitive data (English)",
    input: "This is a simple text with no sensitive information.",
    expectedAnonymized: "This is a simple text with no sensitive information."
  },
  {
    description: "No sensitive data (German)",
    input: "Dies ist ein normaler deutscher Text ohne vertrauliche Daten.",
    expectedAnonymized: "Dies ist ein normaler deutscher Text ohne vertrauliche Daten."
  },
  {
    description: "No sensitive data (French)",
    input: "Ceci est un texte français normal sans informations sensibles.",
    expectedAnonymized: "Ceci est un texte français normal sans informations sensibles."
  },
  {
    description: "Mixed text with no sensitive data",
    input: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    expectedAnonymized: "Lorem ipsum dolor sit amet, consectetur adipiscing elit."
  }
];
async function runTests() {
    let allPassed = true;
    const errors = [];
  
    for (const test of tests) {
      console.log("Running test: " + test.description);
      const anonymizer = new window.Anonymizer();
      anonymizer.setText(test.input);
      
      // Warten bis anonymize fertig ist:
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