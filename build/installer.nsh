; インストーラの追加 UI と、portable 版からの移行処理。
;
; この .nsh はインストーラとアンインストーラの両方のコンパイルに include される。
; アンインストーラ側ではページのマクロが展開されないため、変数を無条件に宣言すると
; 「未使用の変数」警告が出て、electron-builder は警告をエラー扱いにしてビルドが落ちる。
; そのため BUILD_UNINSTALLER で囲う。
;
; ショートカットの作成自体は electron-builder に任せる（AUMI 設定やアンインストール時の
; 後始末を持っているため）。ここでは選ばれなかったものを直後に消す。
; 選択はレジストリに残し、サイレントな自動更新のときはそれを読み直して尊重する。

!ifndef BUILD_UNINSTALLER
  Var CbDesktop
  Var CbStartMenu
  Var DesktopChoice
  Var StartMenuChoice

  ; MUI2 / nsDialogs が読み込まれたあとに展開されるので、関数もこの中に置く
  !macro customPageAfterChangeDir
    Page custom shortcutOptionsPageCreate shortcutOptionsPageLeave

    Function shortcutOptionsPageCreate
      ; 自動更新のときは何も聞かない（初回の選択をそのまま使う）
      ${If} ${isUpdated}
        Abort
      ${EndIf}
      !insertmacro MUI_HEADER_TEXT "Shortcuts" "Choose the shortcuts to create."
      nsDialogs::Create 1018
      Pop $0
      ${If} $0 == error
        Abort
      ${EndIf}
      ${NSD_CreateCheckbox} 0 10u 100% 12u "Create a shortcut on the Desktop"
      Pop $CbDesktop
      ${NSD_Check} $CbDesktop
      ${NSD_CreateCheckbox} 0 30u 100% 12u "Create a shortcut in the Start Menu"
      Pop $CbStartMenu
      ${NSD_Check} $CbStartMenu
      nsDialogs::Show
    FunctionEnd

    Function shortcutOptionsPageLeave
      ${NSD_GetState} $CbDesktop $0
      ${If} $0 == ${BST_CHECKED}
        StrCpy $DesktopChoice "1"
      ${Else}
        StrCpy $DesktopChoice "0"
      ${EndIf}
      ${NSD_GetState} $CbStartMenu $0
      ${If} $0 == ${BST_CHECKED}
        StrCpy $StartMenuChoice "1"
      ${Else}
        StrCpy $StartMenuChoice "0"
      ${EndIf}
    FunctionEnd
  !macroend

  !macro customInstall
    ; ページを出さない経路（サイレント実行・自動更新）では未設定なので既定値を入れる
    ${If} $DesktopChoice == ""
      StrCpy $DesktopChoice "1"
    ${EndIf}
    ${If} $StartMenuChoice == ""
      StrCpy $StartMenuChoice "1"
    ${EndIf}

    ${If} ${isUpdated}
      ; 更新時はページを出していないので、初回の選択を読み直す
      ReadRegStr $R2 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "DesktopShortcut"
      ${If} $R2 != ""
        StrCpy $DesktopChoice $R2
      ${EndIf}
      ReadRegStr $R2 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "StartMenuShortcut"
      ${If} $R2 != ""
        StrCpy $StartMenuChoice $R2
      ${EndIf}
    ${Else}
      WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "DesktopShortcut" "$DesktopChoice"
      WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "StartMenuShortcut" "$StartMenuChoice"
    ${EndIf}

    ${If} $DesktopChoice != "1"
      Delete "$newDesktopLink"
    ${EndIf}
    ${If} $StartMenuChoice != "1"
      Delete "$newStartMenuLink"
    ${EndIf}

    ; portable 版（zip を %LOCALAPPDATA%\ReflectanceSpectraViewer に展開したもの）から
    ; 移行してきた場合に旧コピーを片付ける。
    ; - インストール先が同じ場所なら何もしない
    ; - 旧 exe の存在を確認してから消す（無関係なフォルダを消さないため）
    ; - 旧アプリの終了を待ってから消す。使用中のファイルが残っても RMDir /r は
    ;   黙って続行するので、インストール自体は壊れない
    StrCpy $R0 "$LOCALAPPDATA\ReflectanceSpectraViewer"
    StrCmp "$INSTDIR" "$R0" skipLegacyCleanup 0
    IfFileExists "$R0\Reflectance Spectra Viewer.exe" 0 skipLegacyCleanup
      DetailPrint "Removing the previous portable copy: $R0"
      Sleep 3000
      RMDir /r "$R0"
    skipLegacyCleanup:
  !macroend
!endif
