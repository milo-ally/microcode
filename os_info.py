#!/usr/bin/env python3
"""Print accurate OS information."""

import platform
import sys
import os
import subprocess


def _run_cmd(cmd):
    try:
        return subprocess.check_output(cmd, stderr=subprocess.DEVNULL, text=True).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def _distro_name():
    # Try os-release first (most accurate on modern Linux)
    name = _run_cmd(["sh", "-c", ". /etc/os-release && echo \"$NAME $VERSION_ID\""])
    if name:
        return name
    # Fallback to platform
    try:
        info = platform.freedesktop_os_release()
        return f"{info.get('NAME', '')} {info.get('VERSION_ID', '')}".strip()
    except Exception:
        return platform.system()


def _cpu_info():
    # Real CPU model name
    model = _run_cmd(["sh", "-c", "grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | sed 's/^ //'"])
    if model:
        return model
    # macOS
    model = _run_cmd(["sysctl", "-n", "machdep.cpu.brand_string"])
    if model:
        return model
    return platform.processor() or platform.machine()


def _cpu_count():
    return os.cpu_count()


def _memory():
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    kb = int(line.split()[1])
                    return f"{kb / 1024 / 1024:.1f} GB"
    except OSError:
        pass
    try:
        out = _run_cmd(["sysctl", "-n", "hw.memsize"])
        if out:
            return f"{int(out) / 1024**3:.1f} GB"
    except Exception:
        pass
    return None


def _uptime():
    try:
        with open("/proc/uptime") as f:
            seconds = float(f.read().split()[0])
        days, rem = divmod(seconds, 86400)
        hours, rem = divmod(rem, 3600)
        mins = rem // 60
        parts = []
        if days:
            parts.append(f"{int(days)}d")
        if hours:
            parts.append(f"{int(hours)}h")
        parts.append(f"{int(mins)}m")
        return " ".join(parts)
    except OSError:
        return None


def _load_avg():
    try:
        avg = os.getloadavg()
        return f"{avg[0]:.2f}, {avg[1]:.2f}, {avg[2]:.2f}"
    except OSError:
        return None


def _disk_usage():
    try:
        s = os.statvfs("/")
        total = s.f_frsize * s.f_blocks
        free = s.f_frsize * s.f_bfree
        used = total - free
        pct = used / total * 100 if total else 0
        return f"{used / 1024**3:.1f}G / {total / 1024**3:.1f}G ({pct:.0f}%)"
    except OSError:
        return None


def get_os_info():
    distro = _distro_name()
    info = {
        "OS": distro,
        "Kernel": platform.release(),
        "Architecture": platform.machine(),
        "CPU Model": _cpu_info() or "unknown",
        "CPU Cores": _cpu_count(),
        "Total RAM": _memory() or "unknown",
        "Uptime": _uptime() or "unknown",
        "Load Average (1/5/15m)": _load_avg() or "unknown",
        "Root Disk Usage": _disk_usage() or "unknown",
        "Hostname": platform.node(),
        "User": os.environ.get("USER", "unknown"),
        "Python": f"{sys.version.split()[0]} ({platform.python_implementation()})",
        "CWD": os.getcwd(),
    }
    return info


def main():
    info = get_os_info()
    pad = max(len(k) for k in info)
    sep = "=" * 60
    print(sep)
    print("            System Information")
    print(sep)
    for key, value in info.items():
        print(f"  {key:<{pad}} : {value}")
    print(sep)


if __name__ == "__main__":
    main()
