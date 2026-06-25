echo "canale OK"; date '+%F %T'; echo '--- scraper status ---'; curl -s --max-time 10 http://127.0.0.1:4300/status; echo; echo '--- git HEAD deploy ---'; git -C /opt/withus-backend log --oneline -1
