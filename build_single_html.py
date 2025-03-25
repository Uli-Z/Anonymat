import re
import os

def inline_file(match):
    tag = match.group(0)
    src = match.group(1) or match.group(2)
    if not os.path.exists(src):
        print(f"Warning: File {src} not found.")
        return tag
    with open(src, 'r', encoding='utf-8') as f:
        content = f.read()
    if tag.startswith('<link'):
        return f"<style>\n{content}\n</style>"
    else:
        # Replace problematic </script> strings in JS
        content = content.replace("</script>", "<\\/script>")
        return f"<script>\n{content}\n</script>"

def bundle_html(input_file, output_file, version):
    with open(input_file, 'r', encoding='utf-8') as f:
        html = f.read()

    # Replace version number in the definition of window.appVersion
    html = re.sub(r'window\.appVersion\s*=\s*".*?"', f'window.appVersion = "{version}"', html)

    html = re.sub(r'<script\s+src="([^"]+)"></script>', inline_file, html)
    html = re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)">', inline_file, html)

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"File {output_file} has been created.")

if __name__ == "__main__":
    # Read the version number from the file "version.txt"
    version_file = "version.txt"
    if os.path.exists(version_file):
        with open(version_file, 'r', encoding='utf-8') as f:
            version = f.read().strip()
    else:
        print(f"Warning: {version_file} not found. Default version will be used.")
        version = "0.0.0"

    output_filename = f"./dist/anonymat-{version}.html"
    bundle_html("index.html", output_filename, version)
    # Create a copy of the generated file as dist/anonymat.html
    copy_filename = "./dist/anonymat.html"
    with open(output_filename, 'r', encoding='utf-8') as src, open(copy_filename, 'w', encoding='utf-8') as dest:
        dest.write(src.read())

    print(f"File {copy_filename} has been created as a copy.")