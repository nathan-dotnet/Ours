using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ours.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSavingsAndDistribution : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SavingsGoalId",
                table: "Transactions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BudgetAccountId",
                table: "Couples",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "BudgetAllocationPercent",
                table: "Couples",
                type: "numeric(5,2)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SavingsAccountId",
                table: "Couples",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SavingsAllocationPercent",
                table: "Couples",
                type: "numeric(5,2)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "WantsAccountId",
                table: "Couples",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "WantsAllocationPercent",
                table: "Couples",
                type: "numeric(5,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "MonthlyIncome",
                table: "CoupleMembers",
                type: "numeric(18,2)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Distributions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CoupleId = table.Column<Guid>(type: "uuid", nullable: false),
                    Year = table.Column<int>(type: "integer", nullable: false),
                    Month = table.Column<int>(type: "integer", nullable: false),
                    CombinedIncome = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    BudgetPercent = table.Column<decimal>(type: "numeric(5,2)", nullable: false),
                    BudgetAmount = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    BudgetAccountId = table.Column<Guid>(type: "uuid", nullable: true),
                    SavingsPercent = table.Column<decimal>(type: "numeric(5,2)", nullable: false),
                    SavingsAmount = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    SavingsAccountId = table.Column<Guid>(type: "uuid", nullable: true),
                    WantsPercent = table.Column<decimal>(type: "numeric(5,2)", nullable: false),
                    WantsAmount = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    WantsAccountId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Distributions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Distributions_Accounts_BudgetAccountId",
                        column: x => x.BudgetAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Distributions_Accounts_SavingsAccountId",
                        column: x => x.SavingsAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Distributions_Accounts_WantsAccountId",
                        column: x => x.WantsAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Distributions_Couples_CoupleId",
                        column: x => x.CoupleId,
                        principalTable: "Couples",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SavingsGoals",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CoupleId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    TargetAmount = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    AllocationPercent = table.Column<decimal>(type: "numeric(5,2)", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SavingsGoals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SavingsGoals_Couples_CoupleId",
                        column: x => x.CoupleId,
                        principalTable: "Couples",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Transactions_SavingsGoalId",
                table: "Transactions",
                column: "SavingsGoalId");

            migrationBuilder.CreateIndex(
                name: "IX_Couples_BudgetAccountId",
                table: "Couples",
                column: "BudgetAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_Couples_SavingsAccountId",
                table: "Couples",
                column: "SavingsAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_Couples_WantsAccountId",
                table: "Couples",
                column: "WantsAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_Distributions_BudgetAccountId",
                table: "Distributions",
                column: "BudgetAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_Distributions_CoupleId_Year_Month",
                table: "Distributions",
                columns: new[] { "CoupleId", "Year", "Month" });

            migrationBuilder.CreateIndex(
                name: "IX_Distributions_SavingsAccountId",
                table: "Distributions",
                column: "SavingsAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_Distributions_WantsAccountId",
                table: "Distributions",
                column: "WantsAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_SavingsGoals_CoupleId_UpdatedAt",
                table: "SavingsGoals",
                columns: new[] { "CoupleId", "UpdatedAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_Couples_Accounts_BudgetAccountId",
                table: "Couples",
                column: "BudgetAccountId",
                principalTable: "Accounts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Couples_Accounts_SavingsAccountId",
                table: "Couples",
                column: "SavingsAccountId",
                principalTable: "Accounts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Couples_Accounts_WantsAccountId",
                table: "Couples",
                column: "WantsAccountId",
                principalTable: "Accounts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Transactions_SavingsGoals_SavingsGoalId",
                table: "Transactions",
                column: "SavingsGoalId",
                principalTable: "SavingsGoals",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Couples_Accounts_BudgetAccountId",
                table: "Couples");

            migrationBuilder.DropForeignKey(
                name: "FK_Couples_Accounts_SavingsAccountId",
                table: "Couples");

            migrationBuilder.DropForeignKey(
                name: "FK_Couples_Accounts_WantsAccountId",
                table: "Couples");

            migrationBuilder.DropForeignKey(
                name: "FK_Transactions_SavingsGoals_SavingsGoalId",
                table: "Transactions");

            migrationBuilder.DropTable(
                name: "Distributions");

            migrationBuilder.DropTable(
                name: "SavingsGoals");

            migrationBuilder.DropIndex(
                name: "IX_Transactions_SavingsGoalId",
                table: "Transactions");

            migrationBuilder.DropIndex(
                name: "IX_Couples_BudgetAccountId",
                table: "Couples");

            migrationBuilder.DropIndex(
                name: "IX_Couples_SavingsAccountId",
                table: "Couples");

            migrationBuilder.DropIndex(
                name: "IX_Couples_WantsAccountId",
                table: "Couples");

            migrationBuilder.DropColumn(
                name: "SavingsGoalId",
                table: "Transactions");

            migrationBuilder.DropColumn(
                name: "BudgetAccountId",
                table: "Couples");

            migrationBuilder.DropColumn(
                name: "BudgetAllocationPercent",
                table: "Couples");

            migrationBuilder.DropColumn(
                name: "SavingsAccountId",
                table: "Couples");

            migrationBuilder.DropColumn(
                name: "SavingsAllocationPercent",
                table: "Couples");

            migrationBuilder.DropColumn(
                name: "WantsAccountId",
                table: "Couples");

            migrationBuilder.DropColumn(
                name: "WantsAllocationPercent",
                table: "Couples");

            migrationBuilder.DropColumn(
                name: "MonthlyIncome",
                table: "CoupleMembers");
        }
    }
}
