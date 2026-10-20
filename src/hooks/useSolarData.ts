import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/solarService";
import * as archiveApi from "@/services/archiveHistoryService";
import { istTodayKey } from "@/utils/currentDayGeneration";
import type { EnergyRange } from "@/types/solar";

const LIVE_REFRESH_INTERVAL_MS = 60_000;
const WEATHER_REFRESH_INTERVAL_MS = 15 * 60_000;

export const useLivePower = () =>
  useQuery({
    queryKey: ["live-power"],
    queryFn: api.fetchLivePower,
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
  });

export const useEnergyTotals = () =>
  useQuery({
    queryKey: ["energy-totals"],
    queryFn: api.fetchEnergyTotals,
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
  });

export const usePlantInfo = () => useQuery({ queryKey: ["plant"], queryFn: api.fetchPlantInfo });

export const useInverter = () =>
  useQuery({
    queryKey: ["inverter"],
    queryFn: api.fetchInverter,
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
  });

export const useLogger = () =>
  useQuery({
    queryKey: ["logger"],
    queryFn: api.fetchLogger,
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
  });

// Unauthenticated backend health probe. Used by the diagnostics page to read
// the running backend's application version instead of a hardcoded label.
export const useBackendHealth = () =>
  useQuery({
    queryKey: ["backend-health"],
    queryFn: api.fetchBackendHealth,
    staleTime: 5 * 60_000,
    retry: false,
  });

export const useEnergySeries = (range: EnergyRange, selectedDate: Date) =>
  useQuery({
    queryKey: ["energy-series", range, selectedDate.toISOString().slice(0, 10)],
    queryFn: () => api.fetchEnergySeries(range, selectedDate),
  });

// Shared query for TODAY's Day-series.  "Today" is the plant's Asia/Kolkata
// calendar day, not the browser's UTC day — they differ for the first 5.5 hours
// of every IST day, when the UTC-derived key would fetch yesterday's samples.
// The key still matches the graph's useEnergySeries("day", today) key during the
// hours the two agree, so TanStack Query keeps deduping them — one UTL fetch
// shared by both the Current-power card and the Generation-profile graph.
// refetchInterval keeps the card (and graph) current with new samples as UTL
// publishes them.
export const useTodayDaySeries = () => {
  const today = istTodayKey();

  return useQuery({
    queryKey: ["energy-series", "day", today],
    queryFn: () => api.fetchEnergySeries("day", new Date(), today),
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
  });
};

export const useAnalyticsData = (year: number) =>
  useQuery({
    queryKey: ["analytics", year],
    queryFn: () => archiveApi.fetchArchiveAnalytics(year),
  });

export const useDailyHistory = (selectedDate: Date, enabled = true) =>
  useQuery({
    queryKey: ["history-daily", selectedDate.getFullYear(), selectedDate.getMonth()],
    queryFn: () => api.fetchDailyHistory(selectedDate),
    enabled,
  });

export const useMonthlyHistory = (year: number, enabled = true) =>
  useQuery({
    queryKey: ["history-monthly", year],
    queryFn: () => api.fetchMonthlyHistory(year),
    enabled,
  });

export const useYearlyHistory = (enabled = true) =>
  useQuery({
    queryKey: ["history-yearly"],
    queryFn: api.fetchYearlyHistory,
    enabled,
  });

// EnergyScope Archive source - enabled only while the History page shows it,
// so archive requests never fire in UTL Live mode.
export const useArchiveDailyHistory = (selectedDate: Date, enabled: boolean) =>
  useQuery({
    queryKey: ["archive-history-daily", selectedDate.getFullYear(), selectedDate.getMonth()],
    queryFn: () =>
      archiveApi.fetchArchiveMonthDays(selectedDate.getFullYear(), selectedDate.getMonth()),
    enabled,
  });

export const useArchiveMonthlyHistory = (year: number, enabled: boolean) =>
  useQuery({
    queryKey: ["archive-history-monthly", year],
    queryFn: () => archiveApi.fetchArchiveYearMonths(year),
    enabled,
  });

export const useArchiveYearlyHistory = (enabled: boolean) =>
  useQuery({
    queryKey: ["archive-history-yearly"],
    queryFn: archiveApi.fetchArchiveYears,
    enabled,
  });

export const useArchiveTotalHistory = (enabled: boolean) =>
  useQuery({
    queryKey: ["archive-history-total"],
    queryFn: archiveApi.fetchArchiveTotal,
    enabled,
  });

// Canonical archive summary for the dashboard Energy Summary cards' Archive
// source. Only fetched while at least one summary card is showing Archive
// data; the interval keeps today's row fresh once it is archived.
export const useArchiveSummary = (enabled = true) =>
  useQuery({
    queryKey: ["archive-summary"],
    queryFn: archiveApi.fetchArchiveSummary,
    enabled,
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
    staleTime: LIVE_REFRESH_INTERVAL_MS / 2,
  });

// Manual Dashboard Archive Entry. On success refreshes every archive-backed
// query so the summary cards and History page reflect the new value without a
// hard reload.
export const useManualArchiveEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: archiveApi.submitManualArchiveEntry,

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["archive-summary"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["archive-history-daily"] });
      queryClient.invalidateQueries({ queryKey: ["archive-history-monthly"] });
      queryClient.invalidateQueries({ queryKey: ["archive-history-yearly"] });
      queryClient.invalidateQueries({ queryKey: ["archive-history-total"] });
    },
  });
};

export const useWeather = (latitude: number | undefined, longitude: number | undefined) =>
  useQuery({
    queryKey: ["weather", latitude, longitude],
    queryFn: () => api.fetchWeather(latitude!, longitude!),
    enabled: Number.isFinite(latitude) && Number.isFinite(longitude),
    staleTime: WEATHER_REFRESH_INTERVAL_MS,
    refetchInterval: WEATHER_REFRESH_INTERVAL_MS,
    retry: false,
  });

export const useWeatherNow = () => {
  const { data: plant } = usePlantInfo();
  const weather = useWeather(plant?.latitude, plant?.longitude);

  return {
    ...weather,
    data: weather.data?.current ?? null,
  };
};

export const useMaintenance = () =>
  useQuery({ queryKey: ["maintenance"], queryFn: api.fetchMaintenance });

export const useUpdateMaintenance = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.updateMaintenance,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["maintenance"],
      });
    },
  });
};

export const useNotifications = () =>
  useQuery({ queryKey: ["notifications"], queryFn: api.fetchNotifications });

export const useMarkNotificationsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids?: string[]) => api.markNotificationsRead(ids),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
};

export const useDismissNotification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.dismissNotification(id),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
};

export const usePrediction = () =>
  useQuery({
    queryKey: ["prediction"],
    queryFn: api.fetchPrediction,
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
  });
