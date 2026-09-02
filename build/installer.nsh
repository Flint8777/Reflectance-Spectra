; portable 版（zip を %LOCALAPPDATA%\ReflectanceSpectraViewer に展開したもの）から
; インストーラ版へ移行した利用者のために、旧コピーを片付ける。
; - インストール先が同じ場所なら何もしない
; - 目印として旧 exe の存在を確認してから消す（無関係なフォルダを消さないため）
; - 旧アプリが終了しきる前に走る可能性があるので、少し待ってから RMDir する。
;   使用中のファイルが残っても RMDir /r は黙って続行するので、更新自体は壊れない
!macro customInstall
  StrCpy $R0 "$LOCALAPPDATA\ReflectanceSpectraViewer"
  StrCmp "$INSTDIR" "$R0" skipLegacyCleanup 0
  IfFileExists "$R0\Reflectance Spectra Viewer.exe" 0 skipLegacyCleanup
    DetailPrint "Removing the previous portable copy: $R0"
    Sleep 3000
    RMDir /r "$R0"
  skipLegacyCleanup:
!macroend
