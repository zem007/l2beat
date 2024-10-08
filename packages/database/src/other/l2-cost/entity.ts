import { TrackedTxId } from '@l2beat/shared'
import { ProjectId, UnixTime } from '@l2beat/shared-pure'
import { Insertable, Selectable } from 'kysely'
import { L2Cost } from '../../kysely/generated/types'

export interface L2CostRecord {
  timestamp: UnixTime
  txHash: string
  configurationId: TrackedTxId
  gasUsed: number
  gasPrice: bigint
  calldataLength: number
  calldataGasUsed: number
  blobGasUsed: number | null
  blobGasPrice: bigint | null
}

export function toRecord(row: Selectable<L2Cost>): L2CostRecord {
  return {
    timestamp: UnixTime.fromDate(row.timestamp),
    txHash: row.tx_hash,
    configurationId: row.configuration_id,
    gasUsed: row.gas_used,
    gasPrice: BigInt(row.gas_price),
    calldataLength: row.calldata_length,
    calldataGasUsed: row.calldata_gas_used,
    blobGasUsed: row.blob_gas_used,
    blobGasPrice: row.blob_gas_price ? BigInt(row.blob_gas_price) : null,
  }
}

export function toRow(record: L2CostRecord): Insertable<L2Cost> {
  return {
    timestamp: record.timestamp.toDate(),
    tx_hash: record.txHash,
    configuration_id: record.configurationId.toString(),
    gas_used: record.gasUsed,
    gas_price: record.gasPrice.toString(),
    calldata_length: record.calldataLength,
    calldata_gas_used: record.calldataGasUsed,
    blob_gas_used: record.blobGasUsed,
    blob_gas_price: record.blobGasPrice?.toString() ?? null,
  }
}

export function toRecordWithProjectId(
  row: Selectable<L2Cost> & { project_id: string },
): L2CostRecord & { projectId: ProjectId } {
  return {
    ...toRecord(row),
    projectId: ProjectId(row.project_id),
  }
}
