@echo off
title IMS GROUP - Requisition Approval ERP
echo Starting IMS GROUP Requisition ERP on http://localhost:3000 ...
cd /d "%~dp0"
call npm.cmd run dev
pause
