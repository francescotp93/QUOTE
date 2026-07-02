set +e
BE=/opt/withus-backend
echo "== retry verifica presente? (marker puliti) =="
echo "  setTimeout 2500:  $(grep -c 'setTimeout(r, 2500)' $BE/server/fonti.js 2>&1)"
echo "  commit su disco:  $(git -C $BE rev-parse --short HEAD 2>&1)  ramo $(git -C $BE rev-parse --abbrev-ref HEAD 2>&1)"
echo "== backend attivo =="; systemctl is-active withus-backend.service 2>&1
echo "---fine---"
