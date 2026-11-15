-- DEC-020: fit feedback belongs to the collected order line it describes.

-- AddForeignKey
ALTER TABLE "FitFeedback" ADD CONSTRAINT "FitFeedback_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
