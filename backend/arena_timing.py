"""Small platform timing helpers for the authoritative arena event loop."""
import ctypes
import sys
from ctypes import wintypes


_TIMER_PERIOD_MS = 1
_timer_api = None
_timer_users = 0


def current_timer_resolution_ms():
    """Read this process' current Windows timer resolution for diagnostics."""
    if sys.platform != "win32":
        return None
    try:
        ntdll = ctypes.WinDLL("ntdll")
        query = ntdll.NtQueryTimerResolution
        query.argtypes = (ctypes.POINTER(wintypes.ULONG),
                          ctypes.POINTER(wintypes.ULONG),
                          ctypes.POINTER(wintypes.ULONG))
        query.restype = wintypes.LONG
        maximum = wintypes.ULONG()
        minimum = wintypes.ULONG()
        current = wintypes.ULONG()
        if query(ctypes.byref(maximum), ctypes.byref(minimum),
                 ctypes.byref(current)) != 0:
            return None
        return round(current.value / 10_000, 3)
    except (AttributeError, OSError):
        return None


def enable_high_resolution_timer():
    """Request 1ms Windows timer resolution while an arena server is running."""
    global _timer_api, _timer_users
    if sys.platform != "win32":
        return False
    if _timer_users:
        _timer_users += 1
        return True
    try:
        api = ctypes.WinDLL("winmm")
        api.timeBeginPeriod.argtypes = (ctypes.c_uint,)
        api.timeBeginPeriod.restype = ctypes.c_uint
        api.timeEndPeriod.argtypes = (ctypes.c_uint,)
        api.timeEndPeriod.restype = ctypes.c_uint
        if api.timeBeginPeriod(_TIMER_PERIOD_MS) != 0:
            return False
    except (AttributeError, OSError):
        return False
    _timer_api = api
    _timer_users = 1
    return True


def disable_high_resolution_timer():
    """Release the Windows timer request after the last arena app shuts down."""
    global _timer_api, _timer_users
    if not _timer_users:
        return
    _timer_users -= 1
    if _timer_users:
        return
    api, _timer_api = _timer_api, None
    try:
        if api is not None:
            api.timeEndPeriod(_TIMER_PERIOD_MS)
    except (AttributeError, OSError):
        pass
