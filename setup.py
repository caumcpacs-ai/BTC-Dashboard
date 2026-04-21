"""install.bat 에서 호출되는 설치 스크립트"""
import os, sys, subprocess, shutil, textwrap, time

HERE        = os.path.dirname(os.path.abspath(__file__))
INSTALL_DIR = os.path.join(os.environ["LOCALAPPDATA"], "ultrasound_stats")
STARTUP_DIR = os.path.join(os.environ["APPDATA"],
                "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
DESKTOP     = os.path.join(os.environ["USERPROFILE"], "Desktop")

VENV_DIR    = os.path.join(INSTALL_DIR, ".venv")
PYTHONW     = os.path.join(VENV_DIR, "Scripts", "pythonw.exe")
APP_PY      = os.path.join(INSTALL_DIR, "app.py")

def step(msg): print(f"\n  {msg}")
def ok():      print("     완료")
def err(msg):
    print(f"\n  [오류] {msg}")
    input("\n  엔터를 누르면 종료합니다...")
    sys.exit(1)


def main():
    print()
    print("  ==========================================")
    print("   암센터 초음파 통계 - 설치")
    print("  ==========================================")

    # ── 1. 파일 복사 ──────────────────────────────────────────────────────────
    step("[1/4] 파일 복사 중...")
    for d in ["data", "uploads", "templates"]:
        os.makedirs(os.path.join(INSTALL_DIR, d), exist_ok=True)

    shutil.copy2(os.path.join(HERE, "app.py"),          INSTALL_DIR)
    shutil.copy2(os.path.join(HERE, "requirements.txt"), INSTALL_DIR)
    shutil.copy2(os.path.join(HERE, "templates", "index.html"),
                 os.path.join(INSTALL_DIR, "templates"))
    ok()

    # ── 2. 가상환경 및 패키지 ─────────────────────────────────────────────────
    step("[2/4] 패키지 설치 중... (인터넷 연결 필요)")
    if not os.path.isdir(VENV_DIR):
        ret = subprocess.run([sys.executable, "-m", "venv", VENV_DIR])
        if ret.returncode != 0:
            err("가상환경 생성 실패")

    pip = os.path.join(VENV_DIR, "Scripts", "pip.exe")
    req = os.path.join(INSTALL_DIR, "requirements.txt")
    ret = subprocess.run([pip, "install", "-q", "-r", req])
    if ret.returncode != 0:
        err("패키지 설치 실패 - 인터넷 연결을 확인하세요")
    ok()

    # ── 3. 시작프로그램 등록 ──────────────────────────────────────────────────
    step("[3/4] 자동 시작 등록 중...")
    startup_bat = os.path.join(STARTUP_DIR, "UltrasoundStats.bat")
    with open(startup_bat, "w", encoding="utf-8") as f:
        f.write(textwrap.dedent(f"""\
            @echo off
            tasklist /fi "imagename eq pythonw.exe" 2>nul | find /i "pythonw.exe" >nul
            if errorlevel 1 start "" "{PYTHONW}" "{APP_PY}"
        """))
    ok()

    # ── 4. 바탕화면 바로가기 ──────────────────────────────────────────────────
    step("[4/4] 바탕화면 바로가기 생성 중...")
    url_file = os.path.join(DESKTOP, "암센터 초음파 통계.url")
    with open(url_file, "w", encoding="utf-8") as f:
        f.write("[InternetShortcut]\nURL=http://localhost:5000\n")
    ok()

    # ── 서버 즉시 시작 ────────────────────────────────────────────────────────
    print("\n  서버를 시작합니다...")
    import subprocess as sp
    running = sp.run(
        ["tasklist", "/fi", "imagename eq pythonw.exe"],
        capture_output=True, text=True
    )
    if "pythonw.exe" not in running.stdout.lower():
        sp.Popen([PYTHONW, APP_PY], cwd=INSTALL_DIR,
                 creationflags=0x00000008)  # DETACHED_PROCESS
        time.sleep(3)

    print()
    print("  ==========================================")
    print("   설치 완료!")
    print("   바탕화면의 [암센터 초음파 통계] 클릭으로 접속하세요.")
    print("   PC 재시작 후에도 자동 실행됩니다.")
    print("  ==========================================")
    input("\n  엔터를 누르면 창이 닫힙니다...")


if __name__ == "__main__":
    main()
