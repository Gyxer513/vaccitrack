"""Грубый экстрактор plain-text из RTF (для анализа шаблона)."""
import re
import sys


def rtf_to_text(raw_bytes: bytes) -> str:
    raw = raw_bytes.decode("latin-1")  # чтобы \'XX не терялись

    # \uNNNN? — unicode escapes
    def uni(m):
        n = int(m.group(1))
        if n < 0:
            n += 65536
        return chr(n & 0xFFFF)

    text = re.sub(r"\\u(-?\d+)\??", uni, raw)
    # \'XX — cp1251 byte
    text = re.sub(r"\\'([0-9a-fA-F]{2})",
                  lambda m: bytes([int(m.group(1), 16)]).decode("cp1251", errors="replace"),
                  text)
    # {\*...} — служебные группы
    text = re.sub(r"\{\\\*[^{}]*\}", "", text)
    text = re.sub(r"\\par\b", "\n", text)
    text = re.sub(r"\\tab\b", "\t", text)
    text = re.sub(r"\\cell\b", "\t", text)
    text = re.sub(r"\\row\b", "\n", text)
    text = re.sub(r"\\[a-zA-Z]+-?\d* ?", "", text)
    text = text.replace("{", "").replace("}", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


if __name__ == "__main__":
    with open(sys.argv[1], "rb") as f:
        raw = f.read()
    print(rtf_to_text(raw))
