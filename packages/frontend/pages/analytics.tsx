import Empty from "@/components/layout/Empty"
import {
  useAverageLatencyAnalytics,
  useErrorAnalytics,
  useNewUsersAnalytics,
  useOrg,
  useProject,
  useRunCountAnalytics,
  useUser,
} from "@/utils/dataHooks"
import {
  Button,
  Center,
  Container,
  Group,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Title,
} from "@mantine/core"
import { DatePickerInput } from "@mantine/dates"
import { useLocalStorage } from "@mantine/hooks"
import {
  IconCalendar,
  IconChartAreaLine,
  IconFilter,
} from "@tabler/icons-react"
import { NextSeo } from "next-seo"
import { useEffect, useState } from "react"
import "@mantine/dates/styles.css"
import LineChart from "@/components/analytics/LineChart"
import { CheckLogic, serializeLogic } from "shared"
import CheckPicker from "@/components/checks/Picker"

function getDefaultDateRange() {
  const currentDate = new Date()
  const oneWeekAgoDate = new Date(currentDate)
  oneWeekAgoDate.setDate(currentDate.getDate() - 7)
  const defaultRange: [Date, Date] = [oneWeekAgoDate, currentDate]
  return defaultRange
}

/**
 * This deserialize function handles the old localStorage format and
 * corrupted data (e.g., if the data was manually changed by the user).
 */
export function deserializeDateRange(value: any): [Date, Date] {
  const defaultRange: [Date, Date] = getDefaultDateRange()

  if (!value) {
    return defaultRange
  }
  try {
    const range = JSON.parse(value)

    if (!Array.isArray(range) || range.length !== 2) {
      return defaultRange
    }
    if (isNaN(Date.parse(range[0])) || isNaN(Date.parse(range[1]))) {
      return defaultRange
    }

    const [startDate, endDate] = [new Date(range[0]), new Date(range[1])]

    return [startDate, endDate]
  } catch {
    return defaultRange
  }
}

function calculateChatRange(dateRange: [Date, Date], granularity: Granularity) {
  const [startDate, endDate] = dateRange
  const diffTime = Math.abs(endDate - startDate)
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  const granularityCalculations = {
    hourly: diffDays * 24,
    daily: diffDays,
    weekly: Math.ceil(diffDays / 7),
  }

  return granularityCalculations[granularity] || diffDays
}

export function getDateRange(
  option: "Today" | "7 Days" | "30 Days" | "3 Months",
): Date[] {
  const currentDate = new Date()
  const startDate = new Date()

  const options = {
    Today: () => startDate,
    "7 Days": () => startDate.setDate(currentDate.getDate() - 7),
    "30 Days": () => startDate.setDate(currentDate.getDate() - 30),
    "3 Months": () => startDate.setMonth(currentDate.getMonth() - 3),
  }

  const updateDate = options[option] || options["7 Days"]
  updateDate()

  return [startDate, currentDate]
}

export function getSelectedOption(dateRange) {
  const [startDate, endDate] = dateRange
  const diffDays = (endDate - startDate) / (1000 * 60 * 60 * 24)

  if (diffDays <= 1) return "Today"
  if (diffDays === 7) return "7 Days"
  if (diffDays === 30) return "30 Days"
  if (diffDays >= 89 && diffDays <= 92) return "3 Months"
  return "Custom"
}

function DateRangeSelect({ dateRange, setDateRange }) {
  const selectedOption = getSelectedOption(dateRange)
  const data = ["Today", "7 Days", "30 Days", "3 Months"]
  const displayData = selectedOption === "Custom" ? [...data, "Custom"] : data

  function handleSelectChange(value) {
    const newDateRange = getDateRange(value)
    setDateRange(newDateRange)
  }

  return (
    <Select
      placeholder="Select date range"
      w="100"
      size="xs"
      allowDeselect={false}
      styles={{
        input: {
          height: 32,
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
          borderRight: 0,
        },
      }}
      data={displayData}
      value={selectedOption}
      onChange={handleSelectChange}
    />
  )
}

interface DateRangePickerProps {
  dateRange: [Date, Date]
  setDateRange: (dates: [Date, Date]) => void
}

function DateRangePicker({ dateRange, setDateRange }: DateRangePickerProps) {
  const [localDateRange, setLocalDateRange] = useState<
    [Date | null, Date | null]
  >([dateRange[0], dateRange[1]])

  useEffect(() => {
    setLocalDateRange([dateRange[0], dateRange[1]])
  }, [dateRange])

  function handleDateChange(dates: [Date | null, Date | null]) {
    setLocalDateRange(dates)
    if (dates[0] && dates[1]) {
      setDateRange([dates[0], dates[1]])
    }
  }
  return (
    <DatePickerInput
      type="range"
      placeholder="Pick date range"
      leftSection={<IconCalendar size={18} stroke={1.5} />}
      size="xs"
      w="fit-content"
      styles={{
        input: {
          borderTopLeftRadius: 0,
          height: 32,
          borderBottomLeftRadius: 0,
        },
      }}
      value={localDateRange}
      onChange={handleDateChange}
      maxDate={new Date()}
    />
  )
}

type Granularity = "hourly" | "daily" | "weekly"

interface GranularitySelectProps {
  dateRange: [Date, Date]
  granularity: Granularity
  setGranularity: (granularity: Granularity) => void
}

const determineGranularity = (
  dateRange: [Date, Date],
): "hourly" | "daily" | "weekly" => {
  const [startDate, endDate] = dateRange
  const diffDays =
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)

  if (diffDays <= 1) return "hourly"
  if (diffDays <= 60) return "daily"
  return "weekly"
}

function GranularitySelect({
  dateRange,
  granularity,
  setGranularity,
}: GranularitySelectProps) {
  const [options, setOptions] = useState<
    { value: Granularity; label: string }[]
  >([
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
  ])

  useEffect(() => {
    const newGranularity = determineGranularity(dateRange)
    setGranularity(newGranularity)

    if (newGranularity === "hourly") {
      setOptions([{ value: "hourly", label: "Hourly" }])
    } else if (newGranularity === "daily") {
      setOptions([{ value: "daily", label: "Daily" }])
    } else {
      setOptions([
        { value: "daily", label: "Daily" },
        { value: "weekly", label: "Weekly" },
      ])
    }
  }, [dateRange, setGranularity])

  return (
    <Select
      placeholder="Granularity"
      w="100"
      size="xs"
      ml="md"
      styles={{
        input: {
          height: 32,
        },
      }}
      data={options}
      value={granularity}
      onChange={(value) => setGranularity(value as Granularity)}
    />
  )
}

// TODO: refactor (put utils functions and components in other file)
// TODO: typescript everywhere
// TODO: checks in url
export default function Analytics() {
  const [dateRange, setDateRange] = useLocalStorage({
    key: "dateRange-analytics",
    getInitialValueInEffect: false,
    deserialize: deserializeDateRange,
    defaultValue: getDefaultDateRange(),
  })
  const [startDate, endDate] = dateRange

  const [granularity, setGranularity] = useLocalStorage<Granularity>({
    key: "granularity-analytics",
    getInitialValueInEffect: false,
    defaultValue: determineGranularity(dateRange),
  })

  // TODO: put checks in their own component
  const [checks, setChecks] = useState<CheckLogic>(["AND"])
  const [showCheckBar, setShowCheckBar] = useState(false)
  const serializedChecks = serializeLogic(checks)

  const { project } = useProject()

  // TODO: refacto this
  const { errorsData, isLoading: errorsDataLoading } = useErrorAnalytics(
    startDate,
    endDate,
    granularity,
    serializedChecks,
  )
  const { newUsersData, isLoading: newUsersDataLoading } = useNewUsersAnalytics(
    startDate,
    endDate,
    granularity,
  )
  const { runCountData, isLoading: runCountLoading } = useRunCountAnalytics(
    startDate,
    endDate,
    granularity,
    serializedChecks,
  )
  const { averageLatencyData, isLoading: averageLatencyDataLoading } =
    useAverageLatencyAnalytics(
      startDate,
      endDate,
      granularity,
      serializedChecks,
    )

  const chartRange = calculateChatRange(dateRange, granularity)

  const showBar =
    showCheckBar ||
    checks.filter((f) => f !== "AND" && !["search", "type"].includes(f.id))
      .length > 0

  // TODO:
  const loading =
    errorsDataLoading ||
    newUsersDataLoading ||
    runCountLoading ||
    averageLatencyDataLoading

  if (loading) {
    return (
      <Center h="60vh">
        <Loader />
      </Center>
    )
  }

  return (
    <Empty
      Icon={IconChartAreaLine}
      title="Waiting for data..."
      description="Analytics will appear here once you have some data."
      showProjectId
      enable={!project?.activated}
    >
      <Container size="xl" my="lg">
        <NextSeo title="Analytics" />
        <Stack gap="lg">
          <Title order={2}>Overview</Title>

          <Group gap="xs">
            <Group gap={0}>
              <DateRangeSelect
                dateRange={dateRange}
                setDateRange={setDateRange}
              />
              <DateRangePicker
                dateRange={dateRange}
                setDateRange={setDateRange}
              />
              <GranularitySelect
                dateRange={dateRange}
                granularity={granularity}
                setGranularity={setGranularity}
              />
            </Group>

            {!showBar && (
              <Button
                variant="subtle"
                onClick={() => setShowCheckBar(true)}
                leftSection={<IconFilter size={12} />}
                size="xs"
              >
                Add filters
              </Button>
            )}
          </Group>

          {showBar && (
            <CheckPicker
              minimal
              onChange={setChecks}
              defaultOpened={showCheckBar}
              value={checks}
              restrictTo={(filter) =>
                ["type", "tags", "model", "users", "metadata"].includes(
                  filter.id,
                )
              }
            />
          )}

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <LineChart
              data={errorsData}
              title="Errors Volume"
              description="How many errors were captured in your app"
              agg="sum"
              props={["errorCount"]}
              range={chartRange}
              height={230}
            />

            {checks.length < 2 && (
              // Only show new users if no filters are applied, as it's not a metric that can be filtered
              <LineChart
                range={1000}
                data={newUsersData}
                props={["newUsersCount"]}
                agg="sum"
                title="New Users"
                height={230}
              />
            )}

            <LineChart
              range={chartRange}
              data={runCountData}
              props={["runCount"]}
              agg="sum"
              title="Runs Volume"
              height={230}
            />

            <LineChart
              range={chartRange}
              data={averageLatencyData}
              props={["avgDuration"]}
              agg="avg"
              title="Avg. LLM Latency"
              height={230}
            />
          </SimpleGrid>
        </Stack>
      </Container>
    </Empty>
  )
}
