#!/bin/bash

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

while true; do
    clear
    echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   Docker Extension - Sub-Agents Monitor   ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Agent 1 - Setup
    if [ -f "package.json" ]; then
        echo -e "${GREEN}✓ AGENT 1${NC} - Project Setup [DONE]"
    else
        echo -e "${YELLOW}⏳ AGENT 1${NC} - Setting up project..."
    fi
    
    # Agent 2 - Docker Manager
    if [ -f "src/dockerManager.ts" ]; then
        lines=$(wc -l < src/dockerManager.ts 2>/dev/null || echo 0)
        echo -e "${GREEN}✓ AGENT 2${NC} - Docker Manager [$lines lines]"
    else
        echo -e "${YELLOW}⏳ AGENT 2${NC} - Building Docker Manager..."
    fi
    
    # Agent 3 - TreeView
    if [ -f "src/treeView.ts" ]; then
        lines=$(wc -l < src/treeView.ts 2>/dev/null || echo 0)
        echo -e "${GREEN}✓ AGENT 3${NC} - TreeView Provider [$lines lines]"
    else
        echo -e "${YELLOW}⏳ AGENT 3${NC} - Creating TreeView..."
    fi
    
    # Agent 4 - Logs Panel
    if [ -f "src/logsPanel.ts" ]; then
        lines=$(wc -l < src/logsPanel.ts 2>/dev/null || echo 0)
        echo -e "${GREEN}✓ AGENT 4${NC} - Logs Panel [$lines lines]"
    else
        echo -e "${YELLOW}⏳ AGENT 4${NC} - Building Logs Viewer..."
    fi
    
    # Agent 5 - Commands
    if [ -f "src/commands.ts" ]; then
        lines=$(wc -l < src/commands.ts 2>/dev/null || echo 0)
        echo -e "${GREEN}✓ AGENT 5${NC} - Commands [$lines lines]"
    else
        echo -e "${YELLOW}⏳ AGENT 5${NC} - Registering Commands..."
    fi
    
    # Agent 6 - Tests & Docs
    readme_exists=false
    tests_exist=false
    [ -f "README.md" ] && readme_exists=true
    [ -d "src/test" ] && tests_exist=true
    
    if [ "$readme_exists" = true ] && [ "$tests_exist" = true ]; then
        echo -e "${GREEN}✓ AGENT 6${NC} - Tests & Docs [DONE]"
    else
        echo -e "${YELLOW}⏳ AGENT 6${NC} - Writing tests & documentation..."
    fi
    
    echo ""
    echo -e "${BLUE}═══ Project Files ═══${NC}"
    total_files=$(find . -type f -not -path '*/\.*' -not -path '*/node_modules/*' 2>/dev/null | wc -l | xargs)
    echo "Total files: $total_files"
    
    if [ -d "src" ]; then
        echo ""
        echo "src/"
        tree -L 2 src/ 2>/dev/null || find src/ -type f
    fi
    
    echo ""
    echo -e "${BLUE}═══ Git Status ═══${NC}"
    if git rev-parse --git-dir > /dev/null 2>&1; then
        git status --short
    else
        echo "Not a git repository yet"
    fi
    
    echo ""
    echo -e "${BLUE}Press Ctrl+C to stop${NC}"
    
    sleep 2
done