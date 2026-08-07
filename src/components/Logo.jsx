const C_MARK_PATH = "M1191 357Q1178 273 1137.5 202.5Q1097 132 1033.0 80.0Q969 28 884.0 -1.0Q799 -30 697 -30Q506 -30 365.0 60.5Q224 151 147.5 312.0Q71 473 71 684Q71 848 117.0 983.5Q163 1119 247.5 1218.5Q332 1318 447.5 1372.0Q563 1426 701 1426Q805 1426 872.0 1401.5Q939 1377 972.5 1352.5Q1006 1328 1012 1328Q1019 1328 1033.0 1352.5Q1047 1377 1059.0 1401.5Q1071 1426 1074 1426Q1077 1426 1079.0 1424.0Q1081 1422 1082 1416L1193 1067Q1195 1062 1194.0 1057.5Q1193 1053 1188 1052Q1184 1051 1179.5 1054.0Q1175 1057 1172 1063Q1124 1185 1058.0 1261.5Q992 1338 908.0 1374.5Q824 1411 721 1411Q609 1411 516.0 1366.5Q423 1322 355.0 1236.5Q287 1151 249.5 1027.5Q212 904 212 746Q212 517 282.0 356.0Q352 195 477.5 110.5Q603 26 767 26Q939 26 1043.5 119.5Q1148 213 1184 359Q1185 362 1186.0 363.0Q1187 364 1188 363Q1190 363 1190.5 361.5Q1191 360 1191 357Z"

export default function Logo({ titleSize = 18 }) {
  const iconSize = titleSize + 18

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: iconSize, height: iconSize, borderRadius: iconSize * 0.3,
        background: 'var(--color-accent-solid)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0
      }}>
        <svg viewBox="0 0 1922 1922" width={iconSize * 0.52} height={iconSize * 0.52} style={{ fill: 'var(--color-on-accent)' }}>
          <path transform="matrix(1,0,0,-1,328.33,1659.00)" d={C_MARK_PATH} />
        </svg>
      </div>
      <div>
        <div style={{
          fontWeight: 700, fontSize: 10, letterSpacing: '0.16em',
          color: 'var(--color-text-muted)', textTransform: 'uppercase', lineHeight: 1, marginBottom: 4
        }}>
          Cravelli
        </div>
        <div style={{
          fontWeight: 800, fontSize: titleSize, letterSpacing: '0.005em',
          color: 'var(--color-text)', textTransform: 'uppercase', lineHeight: 1.1
        }}>
          Painel Financeiro
        </div>
      </div>
    </div>
  )
}
