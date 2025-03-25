import re
import os
import time

def inline_file(match):
    tag = match.group(0)
    src = match.group(1) or match.group(2)
    if not os.path.exists(src):
        print(f"Warnung: Datei {src} nicht gefunden.")
        return tag
    with open(src, 'r', encoding='utf-8') as f:
        content = f.read()
    if tag.startswith('<link'):
        return f"<style>\n{content}\n</style>"
    else:
        # Ersetze problematische </script> Strings im JS
        content = content.replace("</script>", "<\\/script>")
        return f"<script>\n{content}\n</script>"

def bundle_html(input_file, output_file, version):
    with open(input_file, 'r', encoding='utf-8') as f:
        html = f.read()

    # Versionsnummer in der Definition von window.appVersion ersetzen
    html = re.sub(r'window\.appVersion\s*=\s*".*?"', f'window.appVersion = "{version}"', html)

    html = re.sub(r'<script\s+src="([^"]+)"></script>', inline_file, html)
    html = re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)">', inline_file, html)

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"Datei {output_file} wurde erstellt.")

def read_version():
    version_file = "version.txt"
    if os.path.exists(version_file):
        with open(version_file, 'r', encoding='utf-8') as f:
            return f.read().strip()
    else:
        print(f"Warnung: {version_file} nicht gefunden. Standardversion wird verwendet.")
        return "0.0.0"

def get_all_mod_times(root_dir):
    """Gibt ein Dictionary {Pfad: mtime} für alle Dateien im Ordner (rekursiv) zurück,
       wobei der Ordner './dist' ignoriert wird."""
    mod_times = {}
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Ordner ausschließen, die nicht überwacht werden sollen:
        if 'dist' in dirnames:
            dirnames.remove('dist')
        for filename in filenames:
            filepath = os.path.join(dirpath, filename)
            try:
                mod_times[filepath] = os.path.getmtime(filepath)
            except OSError:
                pass
    return mod_times

def build():
    version = read_version()
    output_filename = f"./dist/anonymat-{version}.html"
    bundle_html("index.html", output_filename, version)

if __name__ == "__main__":
    # Initialer Build
    build()

    print("Watch-Modus aktiviert. Warte auf Dateiänderungen... (Strg+C zum Beenden)")
    last_mod_times = get_all_mod_times(".")

    try:
        while True:
            time.sleep(1)  # Alle 1 Sekunde prüfen
            current_mod_times = get_all_mod_times(".")
            if current_mod_times != last_mod_times:
                print("Änderungen festgestellt – neuer Build wird erstellt.")
                build()
                last_mod_times = current_mod_times
    except KeyboardInterrupt:
        print("Watch-Modus beendet.")
