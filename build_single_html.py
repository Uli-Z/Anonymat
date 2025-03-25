import re
import os
import time
import argparse
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

def inline_file(match):
    tag = match.group(0)
    src = match.group(1) or match.group(2)
    if not os.path.exists(src):
        return tag
    with open(src, 'r', encoding='utf-8') as f:
        content = f.read()
    if tag.startswith('<link'):
        return f"<style>\n{content}\n</style>"
    else:
        content = content.replace("</script>", "<\\/script>")
        return f"<script>\n{content}\n</script>"

def bundle_html(input_file, output_file, version):
    with open(input_file, 'r', encoding='utf-8') as f:
        html = f.read()
    html = re.sub(r'window\.appVersion\s*=\s*".*?"', f'window.appVersion = "{version}"', html)
    html = re.sub(r'<script\s+src="([^"]+)"></script>', inline_file, html)
    html = re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)">', inline_file, html)
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html)

def build_test_html(input_file, output_file, version, test_js_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        html = f.read()
    html = re.sub(r'window\.appVersion\s*=\s*".*?"', f'window.appVersion = "{version}"', html)
    html = re.sub(r'<script\s+src="([^"]+)"></script>', inline_file, html)
    html = re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)">', inline_file, html)
    if os.path.exists(test_js_file):
        with open(test_js_file, 'r', encoding='utf-8') as f:
            test_js_content = f.read()
    else:
        test_js_content = ""
    html = re.sub(r'</head>', f'<script>\n{test_js_content}\n</script>\n</head>', html, flags=re.IGNORECASE)
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html)

def read_version():
    version_file = "version.txt"
    if os.path.exists(version_file):
        with open(version_file, 'r', encoding='utf-8') as f:
            return f.read().strip()
    else:
        return "0.0.0"

def get_all_mod_times(root_dir):
    mod_times = {}
    for dirpath, dirnames, filenames in os.walk(root_dir):
        if 'dist' in dirnames:
            dirnames.remove('dist')
        for filename in filenames:
            filepath = os.path.join(dirpath, filename)
            try:
                mod_times[filepath] = os.path.getmtime(filepath)
            except OSError:
                pass
    return mod_times

def run_chrome_tests(test_file_path):
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--disable-gpu")
    options.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    driver = webdriver.Chrome(options=options)
    file_url = "file://" + os.path.abspath(test_file_path)
    driver.get(file_url)
    time.sleep(5)  # Wait for tests to execute
    try:
        results = driver.execute_script("return window.testResults;")
    except Exception:
        results = None
    try:
        logs = driver.get_log("browser")
    except Exception:
        logs = []
    driver.quit()
    return results, logs

def build_all():
    version = read_version()
    normal_build = f"./dist/anonymat-{version}.html"
    test_build = f"./dist/anonymat-test-{version}.html"
    bundle_html("index.html", normal_build, version)
    build_test_html("index.html", test_build, version, "test.js")
    return normal_build, test_build

def run_build_and_tests():
    normal_build, test_build = build_all()
    results, _ = run_chrome_tests(test_build)

    if not results or not results.get("success", False):
        print("TESTS FAILED!")
        errors = results.get("errors", [])
        if errors and isinstance(errors, list):
            print("\n=== Test Errors ===")
            for error in errors:
                print(f"- {error.get('description', 'Unknown test')}")
                print(f"  Input: {error.get('input', '')}")
                
                # Anonymization results
                print(f"  Anonymization expected: {error.get('expected_anonymized', '')}")
                print(f"  Anonymization output  : {error.get('anonymize_output', '')}")
                
                # Deanonymization results
                print(f"  Deanonymization expected: {error.get('input', '')}")
                print(f"  Deanonymization output  : {error.get('deanonymize_output', '')}")
                
                print()
            print("=====================")
        else:
            print("No specific errors reported.")
    else:
        print("All tests passed successfully!")

def delete_test_build():
    version = read_version()
    test_build = f"./dist/anonymat-test-{version}.html"
    if os.path.exists(test_build):
        try:
            os.remove(test_build)
            print(f"Test build {test_build} deleted.")
        except Exception as e:
            print(f"Error deleting test build: {e}")
    else:
        print("No test build found to delete.")

def main():
    parser = argparse.ArgumentParser(description="Build script for Anonymat.")
    parser.add_argument("-w", "--watch", action="store_true", help="Activate watch mode.")
    parser.add_argument("-t", "--test", action="store_true", help="Run tests (creates test build).")
    parser.add_argument("-d", "--delete-testbuild", action="store_true", help="Delete the test build if it exists.")
    args = parser.parse_args()

    version = read_version()
    normal_build = f"./dist/anonymat-{version}.html"
    
    if args.test:
        run_build_and_tests()
    else:
        bundle_html("index.html", normal_build, version)
        print(f"Build completed: {normal_build}")

    if args.delete_testbuild:
        delete_test_build()

    if args.watch:
        print("Watch mode activated. Monitoring for file changes... (Press Ctrl+C to exit)")
        last_mod_times = get_all_mod_times(".")
        try:
            while True:
                time.sleep(1)
                current_mod_times = get_all_mod_times(".")
                if current_mod_times != last_mod_times:
                    if args.test:
                        run_build_and_tests()
                    else:
                        version = read_version()
                        normal_build = f"./dist/anonymat-{version}.html"
                        bundle_html("index.html", normal_build, version)
                        print(f"Build completed: {normal_build}")
                    last_mod_times = current_mod_times
        except KeyboardInterrupt:
            print("Watch mode stopped.")

if __name__ == "__main__":
    main()
