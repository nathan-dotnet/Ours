using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ours.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddLoanScheduleFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Added nullable first (rather than DropColumn-then-Add with a throwaway default) so
            // any existing row's old DueDay can be backfilled into a real FirstDueDate below
            // before the column is made required and DueDay is dropped — there happens to be no
            // Loan data in any environment yet, but this keeps the migration correct/replayable
            // regardless.
            migrationBuilder.AddColumn<DateOnly>(
                name: "FirstDueDate",
                table: "Loans",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Frequency",
                table: "Loans",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Monthly");

            // Best-effort reconstruction: DueDay never recorded which month installment 1 was
            // due, so this anchors it to *this* month's occurrence of that day (clamped to the
            // 28th, always a valid day in every month) — a reasonable placeholder for the rare
            // case this migration ever runs against a populated Loans table.
            migrationBuilder.Sql(
                """
                UPDATE "Loans"
                SET "FirstDueDate" = date_trunc('month', now())::date + (LEAST("DueDay", 28) - 1)
                WHERE "FirstDueDate" IS NULL;
                """);

            migrationBuilder.AlterColumn<DateOnly>(
                name: "FirstDueDate",
                table: "Loans",
                type: "date",
                nullable: false,
                oldClrType: typeof(DateOnly),
                oldType: "date",
                oldNullable: true);

            migrationBuilder.DropColumn(
                name: "DueDay",
                table: "Loans");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DueDay",
                table: "Loans",
                type: "integer",
                nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE "Loans" SET "DueDay" = EXTRACT(DAY FROM "FirstDueDate")::int;
                """);

            migrationBuilder.AlterColumn<int>(
                name: "DueDay",
                table: "Loans",
                type: "integer",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.DropColumn(
                name: "FirstDueDate",
                table: "Loans");

            migrationBuilder.DropColumn(
                name: "Frequency",
                table: "Loans");
        }
    }
}
