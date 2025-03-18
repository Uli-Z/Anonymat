import re
import os

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

def bundle_html(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        html = f.read()

    html = re.sub(r'<script\s+src="([^"]+)"></script>', inline_file, html)
    html = re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)">', inline_file, html)

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"Datei {output_file} wurde erstellt.")

if __name__ == "__main__":
    bundle_html("index.html", "./dist/index.html")
