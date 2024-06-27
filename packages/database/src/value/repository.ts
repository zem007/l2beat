import { ProjectId, UnixTime } from '@l2beat/shared-pure'
import { PostgresDatabase, Transaction } from '../kysely'
import {
  CleanDateRange,
  deleteHourlyUntil,
  deleteSixHourlyUntil,
} from '../utils/deleteArchivedRecords'
import { Value, toRecord, toRow } from './entity'
import { selectValue } from './select'
import { prefixSelect } from '../utils/prefix-select'

const BATCH_SIZE = 2_000

export class ValueRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async getForProjects(projectIds: ProjectId[]): Promise<Value[]> {
    const rows = await this.db
      .selectFrom('public.values')
      .select(selectValue)
      .where(
        'project_id',
        'in',
        projectIds.map((id) => id.toString()),
      )
      .orderBy('timestamp', 'asc')
      .execute()

    return rows.map(toRecord)
  }

  async getForProjectsByTimerange(
    projectIds: ProjectId[],
    timeRange: [UnixTime, UnixTime],
  ) {
    const [from, to] = timeRange
    console.log(
      this.db
        .selectFrom('public.values')
        .select(selectValue)
        .where((eb) =>
          eb.and([
            eb(
              'project_id',
              'in',
              projectIds.map((id) => id.toString()),
            ),
            eb('timestamp', '>', from.toDate()),
            eb('timestamp', '<=', to.toDate()),
          ]),
        )
        .orderBy('timestamp', 'asc')
        .compile(),
    )
    const rows = await this.db
      .selectFrom('public.values')
      .select(selectValue)
      .where((eb) =>
        eb.and([
          eb(
            'project_id',
            'in',
            projectIds.map((id) => id.toString()),
          ),
          eb('timestamp', '>', from.toDate()),
          eb('timestamp', '<=', to.toDate()),
        ]),
      )
      .orderBy('timestamp', 'asc')
      .execute()

    return rows.map(toRecord)
  }

  async getLatestValuesForProjects(projectIds?: ProjectId[]): Promise<Value[]> {
    const rows = await this.db
      .with('latest_values', (cb) => {
        const query = cb
          .selectFrom('public.values')
          .select((eb) => [
            eb.fn.max('timestamp').as('timestamp'),
            'project_id',
            'data_source',
          ])
          .groupBy(['project_id', 'data_source'])
        return projectIds === undefined
          ? query
          : query.where(
              'project_id',
              'in',
              projectIds.map((id) => id.toString()),
            )
      })
      .selectFrom('latest_values')
      .innerJoin('public.values', (join) =>
        join
          .onRef('latest_values.data_source', '=', 'public.values.data_source')
          .onRef('latest_values.project_id', '=', 'public.values.project_id')
          .onRef('latest_values.timestamp', '=', 'public.values.timestamp'),
      )
      .select(prefixSelect('public.values', selectValue))
      .execute()
    return rows.map(toRecord)
  }

  async addOrUpdateMany(records: Value[]): Promise<number> {
    await this.db.transaction().execute(async (trx) => {
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        await this._addOrUpdateMany(records.slice(i, i + BATCH_SIZE), trx)
      }
    })

    return records.length
  }

  private async _addOrUpdateMany(records: Value[], trx: Transaction) {
    const rows = records.map(toRow)

    await trx
      .insertInto('public.values')
      .values(rows)
      .onConflict((cb) =>
        cb.columns(['project_id', 'timestamp', 'data_source']).doUpdateSet({
          external: (eb) => eb.ref('excluded.external'),
          external_for_total: (eb) => eb.ref('excluded.external_for_total'),
          canonical: (eb) => eb.ref('excluded.canonical'),
          canonical_for_total: (eb) => eb.ref('excluded.canonical_for_total'),
          native: (eb) => eb.ref('excluded.native'),
          native_for_total: (eb) => eb.ref('excluded.native_for_total'),
        }),
      )
      .execute()
  }

  // #region methods used only in TvlCleaner

  deleteHourlyUntil(dateRange: CleanDateRange) {
    return deleteHourlyUntil(this.db, 'public.values', dateRange)
  }

  deleteSixHourlyUntil(dateRange: CleanDateRange) {
    return deleteSixHourlyUntil(this.db, 'public.values', dateRange)
  }

  // #endregion

  // #region methods used only in tests

  async getAll(): Promise<Value[]> {
    const rows = await this.db
      .selectFrom('public.values')
      .select(selectValue)
      .orderBy('timestamp', 'asc')
      .execute()

    return rows.map(toRecord)
  }

  async addMany(records: Value[], trx?: Transaction): Promise<number> {
    const rows = records.map(toRow)
    const scope = trx ?? this.db

    await scope
      .insertInto('public.values')
      .values(rows)
      .onConflict((cb) =>
        cb.columns(['project_id', 'timestamp', 'data_source']).doUpdateSet({
          external: (eb) => eb.ref('excluded.external'),
          external_for_total: (eb) => eb.ref('excluded.external_for_total'),
          canonical: (eb) => eb.ref('excluded.canonical'),
          canonical_for_total: (eb) => eb.ref('excluded.canonical_for_total'),
          native: (eb) => eb.ref('excluded.native'),
          native_for_total: (eb) => eb.ref('excluded.native_for_total'),
        }),
      )
      .execute()

    return rows.length
  }

  deleteAll() {
    return this.db.deleteFrom('public.values').execute()
  }

  // #endregion
}
