using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ours.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCalendarRecurrenceAndLoanPaymentSchedules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "OriginalOccurrenceStartAt",
                table: "CalendarEvents",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "RecurrenceParentId",
                table: "CalendarEvents",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RepeatDaysOfWeek",
                table: "CalendarEvents",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "RepeatInterval",
                table: "CalendarEvents",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<string>(
                name: "RepeatType",
                table: "CalendarEvents",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "None");

            migrationBuilder.AddColumn<DateOnly>(
                name: "RepeatUntil",
                table: "CalendarEvents",
                type: "date",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "LoanPaymentSchedules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LoanId = table.Column<Guid>(type: "uuid", nullable: false),
                    CoupleId = table.Column<Guid>(type: "uuid", nullable: false),
                    DueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    PlannedAmount = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LoanPaymentSchedules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LoanPaymentSchedules_Couples_CoupleId",
                        column: x => x.CoupleId,
                        principalTable: "Couples",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_LoanPaymentSchedules_Loans_LoanId",
                        column: x => x.LoanId,
                        principalTable: "Loans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CalendarEvents_RecurrenceParentId",
                table: "CalendarEvents",
                column: "RecurrenceParentId");

            migrationBuilder.CreateIndex(
                name: "IX_LoanPaymentSchedules_CoupleId_DueDate",
                table: "LoanPaymentSchedules",
                columns: new[] { "CoupleId", "DueDate" });

            migrationBuilder.CreateIndex(
                name: "IX_LoanPaymentSchedules_CoupleId_UpdatedAt",
                table: "LoanPaymentSchedules",
                columns: new[] { "CoupleId", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_LoanPaymentSchedules_LoanId",
                table: "LoanPaymentSchedules",
                column: "LoanId");

            migrationBuilder.AddForeignKey(
                name: "FK_CalendarEvents_CalendarEvents_RecurrenceParentId",
                table: "CalendarEvents",
                column: "RecurrenceParentId",
                principalTable: "CalendarEvents",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CalendarEvents_CalendarEvents_RecurrenceParentId",
                table: "CalendarEvents");

            migrationBuilder.DropTable(
                name: "LoanPaymentSchedules");

            migrationBuilder.DropIndex(
                name: "IX_CalendarEvents_RecurrenceParentId",
                table: "CalendarEvents");

            migrationBuilder.DropColumn(
                name: "OriginalOccurrenceStartAt",
                table: "CalendarEvents");

            migrationBuilder.DropColumn(
                name: "RecurrenceParentId",
                table: "CalendarEvents");

            migrationBuilder.DropColumn(
                name: "RepeatDaysOfWeek",
                table: "CalendarEvents");

            migrationBuilder.DropColumn(
                name: "RepeatInterval",
                table: "CalendarEvents");

            migrationBuilder.DropColumn(
                name: "RepeatType",
                table: "CalendarEvents");

            migrationBuilder.DropColumn(
                name: "RepeatUntil",
                table: "CalendarEvents");
        }
    }
}
