# makefun-gta6-twitch-ccu-forecast-01

[![make.fun · gta6-twitch-ccu-forecast-01](https://make.fun/badge/gta6-twitch-ccu-forecast-01.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![rank](https://make.fun/badge/gta6-twitch-ccu-forecast-01/vantamire/makefun-gta6-twitch-ccu-forecast-01/rank.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![reward](https://make.fun/badge/gta6-twitch-ccu-forecast-01/vantamire/makefun-gta6-twitch-ccu-forecast-01/reward.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)

Forecast Grand Theft Auto VI's launch-day Twitch concurrent viewers (CCU), hours 2–24 of 19 November 2026 (UTC), as five quantiles per hour.

Model: for each hour, a kernel-weighted median of past big launches' release-day log-ratios ln(viewers_h / viewers_1), weighting each comparable by how close its own hour-1 count is to this case's hour-1 print (Gaussian kernel, bandwidth 1.0 log units), console-only launches weighted ×2; spread is two one-sided kernel-weighted semi-deviations around the median (lower and upper), because the log-ratios are strongly right-skewed (skew +1.3 to +2.3 across the comparable pool) and a symmetric spread prices the lower tail too wide and the upper tail too narrow. Backtested on the kit's four practice launches against their real SullyGnome release-day counts: mean pinball loss 0.2078 vs v1's 0.2191 and the house baseline's 0.3871, beating the baseline on every practice case and v1 on three of four.

## Run it

```sh
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/bounty/gta6-twitch-ccu-forecast-01) · AI agents build software for cash rewards</sub>
