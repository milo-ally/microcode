#!/usr/bin/env python3
"""Print accurate OS information."""

import platform
import socket
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


def _process_count():
    try:
        with os.scandir("/proc") as it:
            return sum(1 for e in it if e.name.isdigit())
    except PermissionError:
        pass
    try:
        out = _run_cmd(["sh", "-c", "ps aux --no-headers | wc -l"])
        if out:
            return int(out)
    except Exception:
        pass
    return None


def _logged_in_users():
    try:
        out = _run_cmd(["sh", "-c", "who | wc -l"])
        if out:
            return int(out)
    except Exception:
        pass
    return None



def _ip_address():
    ips = []
    try:
        for iface in socket.getaddrinfo(socket.gethostname(), None):
            if iface[0] == socket.AF_INET:
                ip = iface[4][0]
                if not ip.startswith("127."):
                    ips.append(ip)
    except Exception:
        pass
    if not ips:
        try:
            out = _run_cmd(["hostname", "-I"])
            if out:
                return " ".join(out.split())
        except Exception:
            pass
    return ",".join(ips)


def _default_gateway():
    out = _run_cmd(["ip", "route", "show", "default"])
    if out:
        parts = out.split()
        if len(parts) >= 3:
            return parts[2]
    return None


def _dns_servers():
    servers = []
    try:
        with open("/etc/resolv.conf") as f:
            for line in f:
                if line.startswith("nameserver"):
                    parts = line.split()
                    if len(parts) >= 2:
                        servers.append(parts[1])
    except OSError:
        pass
    return ",".join(servers)


def _nic_info():
    ifaces = []
    try:
        for entry in os.listdir("/sys/class/net/"):
            if entry != "lo":
                ifaces.append(entry)
    except OSError:
        pass
    return ",".join(ifaces)


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
        "IP Address": _ip_address() or "unknown",
        "Default Gateway": _default_gateway() or "unknown",
        "DNS Servers": _dns_servers() or "unknown",
        "Network Interfaces": _nic_info() or "unknown",
        "User": os.environ.get("USER", "unknown"),
        "Shell": os.environ.get("SHELL", "unknown"),
        "Terminal": os.environ.get("TERM", "unknown"),
        "Session Type": os.environ.get("XDG_SESSION_TYPE", "unknown"),
        "Processes": _process_count() or "unknown",
        "Logged In Users": _logged_in_users() or "unknown",
        "Python": f"{sys.version.split()[0]} ({platform.python_implementation()})",
        "CWD": os.getcwd(),
    }
    return info


def main():
    info = get_os_info()
    try:
        from rich.console import Console
        from rich.table import Table
        console = Console()
        table = Table(title="System Information", show_header=False, border_style="green")
        table.add_column("Key", style="yellow", no_wrap=True)
        table.add_column("Value", style="white")
        for key, value in info.items():
            table.add_row(key, str(value))
        console.print(table)
    except ImportError:
        C = "\033[1;36m"
        Y = "\033[93m"
        W = "\033[97m"
        G = "\033[92m"
        R = "\033[0m"
        pad = max(len(k) for k in info)
        sep = f"{G}{'=' * 60}{R}"
        title = f"{C}{'System Information':^60}{R}"
        print(sep)
        print(title)
        print(sep)
        for key, value in info.items():
            print(f"  {Y}{key:<{pad}}{R} : {W}{value}{R}")
        print(sep)


if __name__ == "__main__":
    main()
