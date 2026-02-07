export const LIMITS = {
  confessionDaily: Number(process.env.CONFESSION_DAILY_LIMIT || 1),
  confessionDailyPremium: Number(process.env.CONFESSION_DAILY_LIMIT_PREMIUM || 2),
  askWeekly: Number(process.env.ASK_WEEKLY_LIMIT || 1),
  binaryDaily: Number(process.env.BINARY_DAILY_LIMIT || 1),
  voteMinute: Number(process.env.VOTE_MINUTE_LIMIT || 30),
  voteHour: Number(process.env.VOTE_HOUR_LIMIT || 200),
  flagHourly: Number(process.env.FLAG_HOURLY_LIMIT || 10),
  flagThreshold: Number(process.env.FLAG_THRESHOLD || 5),
};
