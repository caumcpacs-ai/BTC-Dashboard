Set WshShell = CreateObject("WScript.Shell")
' Get the directory of the script
strPath = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
' Run the batch file in hidden mode (0 = hidden, True = wait for completion)
WshShell.Run "cmd /c cd /d """ & strPath & """ && npm start", 0, False
