H=$(hostname)
if [ "$H" = "vps-59c68330" ]; then
  systemctl stop cmd-runner.timer 2>/dev/null
  echo "OLD ($H): canale comandi CEDUTO al nuovo (autopull e quotatori restano attivi)"
else
  echo "NEW ($H): pronto, prendo io il canale"
fi
