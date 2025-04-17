#!/usr/bin/env python3
import re
import os
import time
import argparse

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
        # Escaping </script> für safety
        content = content.replace("</script>", "<\\/script>")
        return f"<script>\n{content}\n</script>"

def bundle_html(input_file, output_file, version):
    with open(input_file, 'r', encoding='utf-8') as f:
        html = f.read()
    # Version updaten
    html = re.sub(r'window\.appVersion\s*=\s*".*?"',
                  f'window.appVersion = "{version}"', html)
    # JS und CSS inline
    html = re.sub(r'<script\s+src="([^"]+)"></script>',
                  inline_file, html)
    html = re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)">',
                  inline_file, html)
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html)

def build_test_html(input_file, output_file, version, test_js_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        html = f.read()
    html = re.sub(r'window\.appVersion\s*=\s*".*?"',
                  f'window.appVersion = "{version}"', html)
    html = re.sub(r'<script\s+src="([^"]+)"></script>',
                  inline_file, html)
    html = re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)">',
                  inline_file, html)
    # Test-Script einbinden
    if os.path.exists(test_js_file):
        with open(test_js_file, 'r', encoding='utf-8') as f:
            test_js = f.read()
    else:
        test_js = ""
    html = re.sub(r'</head>',
                  f'<script>\n{test_js}\n</script>\n</head>',
                  html, flags=re.IGNORECASE)
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html)

def read_version():
    version_file = "version.txt"
    if os.path.exists(version_file):
        with open(version_file, 'r', encoding='utf-8') as f:
            return f.read().strip()
    return "0.0.0"

def get_all_mod_times(root_dir):
    mod_times = {}
    for dirpath, dirnames, filenames in os.walk(root_dir):
        if 'dist' in dirnames:
            dirnames.remove('dist')
        for fn in filenames:
            path = os.path.join(dirpath, fn)
            try:
                mod_times[path] = os.path.getmtime(path)
            except OSError:
                pass
    return mod_times

def build_normal():
    version = read_version()
    out = f"./dist/anonymat-{version}.html"
    bundle_html("index.html", out, version)
    return out

def build_test():
    version = read_version()
    out = f"./dist/anonymat-test-{version}.html"
    build_test_html("index.html", out, version, "test.js")
    return out

def delete_test_build():
    version = read_version()
    test_path = f"./dist/anonymat-test-{version}.html"
    if os.path.exists(test_path):
        try:
            os.remove(test_path)
            print(f"Test build gelöscht: {test_path}")
        except Exception as e:
            print(f"Fehler beim Löschen: {e}")
    else:
        print("Kein Test-Build zum Löschen gefunden.")

def main():
    parser = argparse.ArgumentParser(description="Build script für Anonymat.")
    parser.add_argument("-w", "--watch", action="store_true",
                        help="Änderungen überwachen und neu bauen.")
    parser.add_argument("-t", "--test", action="store_true",
                        help="Nur Test-Version bauen.")
    parser.add_argument("-d", "--delete-testbuild", action="store_true",
                        help="Test-Version löschen, falls vorhanden.")
    args = parser.parse_args()

    if args.delete_testbuild:
        delete_test_build()
        return

    if args.test:
        path = build_test()
        print(f"Test-Build erstellt: {path}")
    else:
        path = build_normal()
        print(f"Build abgeschlossen: {path}")

    if args.watch:
        print("Watch-Modus aktiv. (Strg+C zum Beenden)")
        last = get_all_mod_times(".")
        try:
            while True:
                time.sleep(1)
                current = get_all_mod_times(".")
                if current != last:
                    if args.test:
                        p = build_test()
                        print(f"Test-Build aktualisiert: {p}")
                    else:
                        p = build_normal()
                        print(f"Build abgeschlossen: {p}")
                    last = current
        except KeyboardInterrupt:
            print("Watch-Modus beendet.")

if __name__ == "__main__":
    main()
