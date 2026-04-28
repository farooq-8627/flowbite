import sys
import collections

with open(".gemini/find_output.txt", "r") as f:
    lines = [line.strip() for line in f if line.strip()]

templates = {
    "next-shadcn-admin-dashboard": [],
    "shadboard": [],
    "shadcnstore": [],
    "shadcn-dashboard-2": []
}

for line in lines:
    for t in templates.keys():
        if f"/Orbitly/{t}/" in line:
            # Strip the prefix to get relative path
            rel_path = line.split(f"/Orbitly/{t}/")[1]
            templates[t].append(rel_path)

def build_tree(paths):
    tree = collections.defaultdict(dict)
    for path in paths:
        parts = path.split('/')
        current = tree
        for part in parts:
            if part not in current:
                current[part] = {}
            current = current[part]
    return tree

def get_description(name, is_dir, path_str):
    if not is_dir:
        if name.endswith('.tsx') or name.endswith('.ts'):
            if "layout" in name: return "Layout wrapper for this route."
            if "page" in name: return "Main page UI component."
            if "route" in name: return "API endpoint."
            if "components" in path_str: return "Reusable UI component."
            if "hooks" in path_str: return "Custom React hook logic."
            if "lib" in path_str or "utils" in path_str: return "Utility functions."
            if "schema" in name: return "Data validation schema."
            return "TypeScript file."
        elif name.endswith('.json'):
            if "package.json" in name: return "NPM dependencies and scripts."
            if "components.json" in name: return "Shadcn UI configuration."
            if "data" in path_str: return "Mock JSON data."
            return "JSON configuration or data file."
        elif name.endswith('.css'):
            return "Styles / Tailwind directives."
        elif name.endswith('.md') or name.endswith('.mdx'):
            return "Markdown documentation or content."
        elif name.endswith('.mjs') or name.endswith('.js'):
            return "Configuration file."
        return "File."
    else:
        if name == "app": return "Next.js App Router root directory."
        if name == "components": return "Reusable UI and feature components."
        if name == "ui": return "Base Shadcn UI components."
        if name == "lib" or name == "utils": return "Utility functions and helpers."
        if name == "hooks": return "React custom hooks."
        if name == "types": return "TypeScript type definitions."
        if name == "contexts" or name == "providers": return "React Context providers."
        if name == "data": return "Static or mock data."
        if name == "styles": return "Global stylesheets."
        if name == "dashboard": return "Dashboard feature module."
        if name == "auth": return "Authentication feature module."
        if name == "landing": return "Landing page feature module."
        return "Directory."

def print_tree(d, path_prefix="", indent=""):
    out = ""
    items = sorted(d.keys())
    for i, key in enumerate(items):
        is_last = (i == len(items) - 1)
        branch = "└── " if is_last else "├── "
        is_dir = len(d[key]) > 0
        desc = get_description(key, is_dir, path_prefix + "/" + key)
        
        icon = "📁" if is_dir else "📄"
        out += f"{indent}{branch}{icon} {key} - {desc}\n"
        
        if is_dir:
            next_indent = indent + ("    " if is_last else "│   ")
            out += print_tree(d[key], path_prefix + "/" + key, next_indent)
    return out

with open(".gemini/dashboard-template-mapping.md", "w") as out:
    out.write("# Orbitly Dashboard Architecture & Detailed Template Mapping\n\n")
    out.write("This document provides a complete graph of the folder structures for all templates, detailing what each folder and file does. This will serve as a comprehensive reference to map and copy features properly.\n\n")
    
    for t, paths in templates.items():
        if not paths:
            continue
        out.write(f"## {t.upper()}\n\n")
        out.write("```text\n")
        tree = build_tree(paths)
        # Simplify the tree if it's too huge, or print the whole thing
        out.write(print_tree(tree))
        out.write("```\n\n")
        
        out.write(f"### Summary of `{t}`\n")
        out.write("- **Primary Use:** Reference for specific UI or layout aspects.\n")
        out.write("- **Integration Strategy:** Copy the relevant components (`.tsx`) into Orbitly's `core/` or `features/` folders, updating imports to match our colocation architecture. Re-wire mock JSON data to Convex queries.\n\n")
        out.write("---\n\n")
