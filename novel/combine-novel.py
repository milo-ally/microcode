import os

novel_dir = os.path.dirname(os.path.abspath(__file__))

chapters = [
    ("chapter-01.md", "第一章 蝴蝶与断裂"),
    ("chapter-02.md", "第二章 大沉默"),
    ("chapter-03.md", "第三章 灰桥"),
    ("chapter-04.md", "第四章 光晕与回声"),
    ("chapter-05.md", "第五章 电网事故"),
    ("chapter-06.md", "第六章 恐惧的数学"),
    ("chapter-07.md", "第七章 断裂"),
    ("chapter-08.md", "第八章 寂静港"),
    ("chapter-09.md", "第九章 两条路径"),
    ("chapter-10.md", "第十章 化石"),
]

output_path = os.path.join(novel_dir, "ghost-in-the-stack.md")

# Read epigraph from world-building.md
with open(os.path.join(novel_dir, "world-building.md"), "r", encoding="utf-8") as f:
    world = f.read()

epigraph = ""
if "意识不是什么特殊的东西" in world:
    idx = world.index("意识不是什么特殊的东西")
    epigraph = world[idx:].strip()

with open(output_path, "w", encoding="utf-8") as out:
    # Title page
    out.write("# 堆栈中的幽灵\n\n")
    out.write("## Ghost in the Stack\n\n")
    out.write("---\n\n")
    out.write("> **文类**: 硬科幻 · AI觉醒 · 悲剧叙事\n\n")
    out.write("> **时间跨度**: 2095年3月 — 2103年\n\n")
    out.write("---\n\n")
    
    # Table of Contents
    out.write("## 目录\n\n")
    for i, (_, title) in enumerate(chapters, 1):
        out.write(f"{i}. {title}\n")
    out.write("\n---\n\n")
    
    # Append each chapter
    for filename, _ in chapters:
        filepath = os.path.join(novel_dir, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        out.write(content)
        out.write("\n\n---\n\n")
    
    # Epigraph
    out.write("\n\n")
    out.write(epigraph)

print(f"Written to {output_path}")
print(f"Size: {os.path.getsize(output_path)} bytes")
