@echo off
rem FT-IRスペクトルビューアーの起動バッチファイル（Python特定バージョン指定）

rem カレントディレクトリをスクリプトの場所に設定
cd /d "%~dp0"

rem ===== Python実行パスの設定 =====
rem 以下の行を環境に合わせて編集してください
rem 例：C:\Users\PHOBOS\AppData\Local\Programs\Python\Python39\python.exe

set PYTHON_PATH=python
rem 必要に応じてコメントを外して実際のPythonパスを設定
rem set PYTHON_PATH=C:\Path\To\Your\Python.exe

rem Pythonスクリプトを実行
"%PYTHON_PATH%" SOUP.py

rem 終了時に自動的にウィンドウを閉じないようにする（エラーが発生した場合のために）
if %ERRORLEVEL% NEQ 0 pause
