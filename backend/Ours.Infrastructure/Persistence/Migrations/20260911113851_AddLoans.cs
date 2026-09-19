using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ours.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddLoans : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "LoanId",
                table: "Transactions",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Loans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CoupleId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Provider = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    OriginalAmount = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    MonthlyPayment = table.Column<decimal>(type: "numeric(18,2)", nullable: false),
                    TotalInstallments = table.Column<int>(type: "integer", nullable: false),
                    DueDay = table.Column<int>(type: "integer", nullable: false),
                    FeesAmount = table.Column<decimal>(type: "numeric(18,2)", nullable: true),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    PaymentAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Loans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Loans_Accounts_PaymentAccountId",
                        column: x => x.PaymentAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Loans_AspNetUsers_OwnerUserId",
                        column: x => x.OwnerUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Loans_Couples_CoupleId",
                        column: x => x.CoupleId,
                        principalTable: "Couples",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Transactions_LoanId",
                table: "Transactions",
                column: "LoanId");

            migrationBuilder.CreateIndex(
                name: "IX_Loans_CoupleId_UpdatedAt",
                table: "Loans",
                columns: new[] { "CoupleId", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Loans_OwnerUserId",
                table: "Loans",
                column: "OwnerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Loans_PaymentAccountId",
                table: "Loans",
                column: "PaymentAccountId");

            migrationBuilder.AddForeignKey(
                name: "FK_Transactions_Loans_LoanId",
                table: "Transactions",
                column: "LoanId",
                principalTable: "Loans",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Transactions_Loans_LoanId",
                table: "Transactions");

            migrationBuilder.DropTable(
                name: "Loans");

            migrationBuilder.DropIndex(
                name: "IX_Transactions_LoanId",
                table: "Transactions");

            migrationBuilder.DropColumn(
                name: "LoanId",
                table: "Transactions");
        }
    }
}
